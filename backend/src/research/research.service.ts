import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import * as path from 'path';
import {
  Agent,
  Provider,
  ResearchTask,
  SearchSetting,
  Trace,
  TraceSpan,
  UsageRecord,
  User,
} from '../entities';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { computeCost, invokeLlm } from './llm';
import { renderPdf } from './pdf';
import { SearchResultItem, webSearch } from '../search/bocha';

export interface ProgressEvent {
  time: string;
  step: string;
  message: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
}

export interface StreamEvent {
  node: string;
  channel: 'reasoning' | 'content';
  delta: string;
  reset?: boolean;
}

class TaskStoppedError extends Error {
  constructor() {
    super('任务已被用户停止');
  }
}

const ResearchState = Annotation.Root({
  productName: Annotation<string>,
  searchContext: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  references: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  outline: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  sections: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  markdown: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

@Injectable()
export class ResearchService {
  private logger = new Logger(ResearchService.name);
  private listeners = new Map<number, Set<(e: ProgressEvent) => void>>();
  private streamListeners = new Map<number, Set<(e: StreamEvent) => void>>();
  private stopRequests = new Set<number>();

  constructor(
    @InjectRepository(ResearchTask) private tasks: Repository<ResearchTask>,
    @InjectRepository(Trace) private traces: Repository<Trace>,
    @InjectRepository(TraceSpan) private spans: Repository<TraceSpan>,
    @InjectRepository(UsageRecord) private usage: Repository<UsageRecord>,
    @InjectRepository(SearchSetting) private searchSettings: Repository<SearchSetting>,
    private subscriptions: SubscriptionsService,
  ) {}

  // 任务未成功结束时退回已消耗的按次额度
  private async refundIfUsed(task: ResearchTask) {
    if (!task.usedCredit) return;
    task.usedCredit = false;
    await this.subscriptions.refundCredit(task.user.id);
  }

  subscribe(taskId: number, fn: (e: ProgressEvent) => void) {
    if (!this.listeners.has(taskId)) this.listeners.set(taskId, new Set());
    this.listeners.get(taskId)!.add(fn);
    return () => {
      this.listeners.get(taskId)?.delete(fn);
      if (this.listeners.get(taskId)?.size === 0) this.listeners.delete(taskId);
    };
  }

  subscribeStream(taskId: number, fn: (e: StreamEvent) => void) {
    if (!this.streamListeners.has(taskId)) this.streamListeners.set(taskId, new Set());
    this.streamListeners.get(taskId)!.add(fn);
    return () => {
      this.streamListeners.get(taskId)?.delete(fn);
      if (this.streamListeners.get(taskId)?.size === 0) this.streamListeners.delete(taskId);
    };
  }

  requestStop(taskId: number) {
    this.stopRequests.add(taskId);
  }

  async run(taskId: number) {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task || !task.agent || (!task.provider && !task.agent.provider)) {
      if (task) {
        task.status = 'failed';
        task.error = '未选择模型且智能体未配置默认模型供应商';
        await this.refundIfUsed(task);
        await this.tasks.save(task);
      }
      return;
    }
    const agent = task.agent as Agent;
    const provider = (task.provider ?? agent.provider) as Provider;
    const user = task.user as User;

    const trace = await this.traces.save(
      this.traces.create({
        taskId: task.id,
        name: `${agent.name} / ${task.productName}`,
        status: 'running',
        startedAt: new Date(),
        spans: [],
      }),
    );

    let totalIn = 0;
    let totalOut = 0;
    const events: ProgressEvent[] = [];

    const progress = async (
      step: string,
      message: string,
      status: ProgressEvent['status'] = 'running',
    ) => {
      const e: ProgressEvent = { time: new Date().toISOString(), step, message, status };
      events.push(e);
      task.progress = JSON.stringify(events);
      await this.tasks.save(task);
      this.listeners.get(task.id)?.forEach((fn) => fn(e));
    };

    const checkStopped = () => {
      if (this.stopRequests.has(task.id)) throw new TaskStoppedError();
    };

    const emitStream = (e: StreamEvent) => {
      this.streamListeners.get(task.id)?.forEach((fn) => fn(e));
    };

    // 限流/超时自动重试：全并行时遇到 429/限流就指数退避等待，直到完成
    const isRetryable = (e: any) => {
      const msg = String(e?.message ?? e).toLowerCase();
      return (
        e?.status === 429 ||
        e?.status === 503 ||
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('overloaded') ||
        msg.includes('timeout') ||
        msg.includes('限流') ||
        msg.includes('econnreset') ||
        msg.includes('fetch failed')
      );
    };
    const withRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        checkStopped();
        try {
          return await fn();
        } catch (e) {
          if (attempt >= 6 || !isRetryable(e)) throw e;
          const delay = Math.min(60_000, 2000 * 2 ** attempt) + Math.random() * 1000;
          this.logger.warn(
            `任务 ${task.id} ${label} 触发限流/网络错误，${Math.round(delay / 1000)}s 后重试（第 ${attempt + 1} 次）: ${String((e as any)?.message ?? e).slice(0, 200)}`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    };

    const callLlm = async (nodeName: string, prompt: string) => {
      const startedAt = new Date();
      emitStream({ node: nodeName, channel: 'content', delta: '', reset: true });
      // 流式输出按小段合并后推送，避免逐 token 发送过于频繁
      const buf: Record<'reasoning' | 'content', string> = { reasoning: '', content: '' };
      let lastFlush = Date.now();
      const flush = () => {
        (['reasoning', 'content'] as const).forEach((ch) => {
          if (buf[ch]) {
            emitStream({ node: nodeName, channel: ch, delta: buf[ch] });
            buf[ch] = '';
          }
        });
        lastFlush = Date.now();
      };
      try {
        const res = await withRetry(
          () =>
            invokeLlm(provider, agent.systemPrompt, prompt, (d) => {
              buf[d.channel] += d.delta;
              if (Date.now() - lastFlush > 250 || buf[d.channel].length > 200) flush();
            }),
          nodeName,
        );
        flush();
        totalIn += res.inputTokens;
        totalOut += res.outputTokens;
        await this.spans.save(
          this.spans.create({
            trace,
            name: nodeName,
            status: 'done',
            startedAt,
            endedAt: new Date(),
            input: prompt.slice(0, 2000),
            output: (res.reasoning ? `【思考过程】\n${res.reasoning.slice(0, 2000)}\n\n【输出】\n` : '') + res.text.slice(0, 4000),
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
          }),
        );
        await this.usage.save(
          this.usage.create({
            user,
            provider,
            taskId: task.id,
            model: provider.model,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
            cost: computeCost(provider, res.inputTokens, res.outputTokens),
          }),
        );
        return res.text;
      } catch (e: any) {
        flush();
        await this.spans.save(
          this.spans.create({
            trace,
            name: nodeName,
            status: 'failed',
            startedAt,
            endedAt: new Date(),
            input: prompt.slice(0, 2000),
            output: String(e?.message ?? e).slice(0, 2000),
          }),
        );
        throw e;
      }
    };

    // 全局参考文献库：所有搜索（首轮 + 各章定向 + 缺失补搜）统一编号，保证引用 [n] 一致
    const refList: SearchResultItem[] = [];
    const refIndex = new Map<string, number>();
    const addRefs = (items: SearchResultItem[]) => {
      for (const it of items) {
        if (!it.url || refIndex.has(it.url)) continue;
        refIndex.set(it.url, refList.length + 1);
        refList.push(it);
      }
    };
    const formatRefs = (items: SearchResultItem[]) =>
      items
        .map(
          (r) =>
            `[${refIndex.get(r.url) ?? '?'}] ${r.name}（${r.siteName || r.url}${r.datePublished ? ` · ${r.datePublished.slice(0, 10)}` : ''}）\n${r.snippet}`,
        )
        .join('\n\n');

    const searchSetting = (await this.searchSettings.find({ take: 1 }))[0];
    const searchEnabled =
      !!searchSetting?.enabled &&
      !!(searchSetting.provider === 'doubao' ? searchSetting.doubaoApiKey : searchSetting.apiKey);
    const searchProviderName = searchSetting?.provider === 'doubao' ? '豆包搜索' : '博查AI';

    const doSearch = async (
      spanName: string,
      query: string,
      count?: number,
    ): Promise<SearchResultItem[]> => {
      if (!searchEnabled) return [];
      const startedAt = new Date();
      try {
        const { items } = await withRetry(
          () =>
            webSearch(
              { ...searchSetting, resultCount: count ?? searchSetting.resultCount },
              query,
            ),
          spanName,
        );
        addRefs(items);
        await this.spans.save(
          this.spans.create({
            trace,
            name: `${spanName}(${searchProviderName})`,
            status: 'done',
            startedAt,
            endedAt: new Date(),
            input: query.slice(0, 500),
            output: formatRefs(items).slice(0, 4000),
          }),
        );
        return items;
      } catch (e: any) {
        await this.spans.save(
          this.spans.create({
            trace,
            name: `${spanName}(${searchProviderName})`,
            status: 'failed',
            startedAt,
            endedAt: new Date(),
            input: query.slice(0, 500),
            output: String(e?.message ?? e).slice(0, 2000),
          }),
        );
        this.logger.warn(`任务 ${task.id} 搜索失败（${spanName}）: ${e?.message ?? e}`);
        return [];
      }
    };

    const searchNode = async (state: typeof ResearchState.State) => {
      if (!searchEnabled) return {};
      await progress('web_search', `正在联网搜索最新资料（${searchProviderName}，最新优先）…`);
      const items = await doSearch(
        'web_search',
        `${state.productName} 最新 产品 调研 评测 市场`,
      );
      if (items.length === 0) {
        await progress('web_search', '联网搜索未获得结果，各章节将单独定向搜索补充资料', 'done');
        return {};
      }
      await progress('web_search', `搜索完成，获取到 ${items.length} 条最新资料`, 'done');
      return { searchContext: formatRefs(items) };
    };

    const withContext = (state: typeof ResearchState.State) =>
      state.searchContext
        ? `\n以下是通过联网搜索获取的最新资料（已按发布时间最新优先排序），请优先采用时间最新的数据撰写，并在正文中用 [n] 标注引用：\n${state.searchContext}\n`
        : '';

    // 去掉模型在章节正文开头重复输出的章节标题（报告合成时已统一加标题）
    const stripDuplicateTitle = (title: string, text: string) => {
      const norm = (s: string) =>
        s.replace(/^#+\s*/, '').replace(/[*\s、.．:：（）()【】\[\]-]/g, '');
      const lines = text.split('\n');
      let i = 0;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) {
          i++;
          continue;
        }
        const isHeading = t.startsWith('#');
        if (
          norm(t) === norm(title) ||
          (isHeading && (norm(t).includes(norm(title)) || norm(title).includes(norm(t))))
        ) {
          i++;
          continue;
        }
        break;
      }
      return lines.slice(i).join('\n').trimStart();
    };

    // 大纲提示词中含 [固定大纲] 标记时，直接使用标记后的章节列表（每行一章），不经模型生成
    const FIXED_OUTLINE_TAG = '[固定大纲]';

    const outlineNode = async (state: typeof ResearchState.State) => {
      checkStopped();
      const fixedIdx = (agent.outlinePrompt || '').indexOf(FIXED_OUTLINE_TAG);
      if (fixedIdx >= 0) {
        const outline = agent.outlinePrompt
          .slice(fixedIdx + FIXED_OUTLINE_TAG.length)
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 40);
        await progress('outline', `使用固定大纲，共 ${outline.length} 个章节：${outline.join('、')}`, 'done');
        return { outline };
      }
      await progress('outline', '正在规划报告章节大纲…');
      const prompt = `${agent.outlinePrompt}\n[OUTLINE]\n产品：${state.productName}\n${withContext(state)}请直接输出章节标题列表，每行一个，不要编号。`;
      const text = await callLlm('outline', prompt);
      const outline = text
        .split('\n')
        .map((l) => l.replace(/^[-*\d.\s\[\]+]+/, '').trim())
        .filter(Boolean)
        .slice(0, 8);
      await progress('outline', `大纲完成，共 ${outline.length} 个章节：${outline.join('、')}`, 'done');
      return { outline };
    };

    // 章节标题去掉编号/装饰符，提取用于搜索的关键词
    const titleKeywords = (title: string) =>
      title
        .replace(/^第[一二三四五六七八九十\d]+章/, '')
        .replace(/[★｜|【】\[\]（）()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const MISSING_MARK = '未获取到公开数据';

    // 单章子智能体：定向搜索 → 撰写 → 缺数据补搜重写
    const writeSection = async (
      state: typeof ResearchState.State,
      title: string,
      i: number,
      total: number,
    ): Promise<string> => {
      const keywords = titleKeywords(title);
      checkStopped();
      let sectionContext = '';
      if (searchEnabled && keywords) {
        await progress('web_search', `[子智能体 ${i + 1}] 正在定向搜索「${keywords}」相关最新资料…`);
        const items = await doSearch(
          `search:${title}`,
          `${state.productName} ${keywords} 最新数据`,
          6,
        );
        if (items.length > 0) sectionContext = formatRefs(items);
      }
      checkStopped();
      await progress('section', `[子智能体 ${i + 1}] 正在撰写第 ${i + 1}/${total} 章：${title}…`);
      const baseContext =
        withContext(state) +
        (sectionContext
          ? `\n以下是针对本章主题定向搜索到的最新资料，请优先采用：\n${sectionContext}\n`
          : '');
      const otherChapters = state.outline.filter((t) => t !== title).join('、');
      const styleRules = `【写作要求】行文简洁严谨、直入主题，不写套话和重复铺垫；数据和要点必须全面，优先用表格/要点列表呈现；只写本章职责范围内的内容，不要重复其他章节（${otherChapters}）会覆盖的内容，也不要在章内重复同一信息。`;
      const prompt = `${agent.sectionPrompt}\n产品：${state.productName}\n章节：${title}\n${styleRules}\n${baseContext}请输出该章节的调研内容（Markdown 格式，不要重复章节标题）。只有在搜索资料和公开信息中确实找不到时才标注「${MISSING_MARK}」。`;
      let text = await callLlm(`section:${title}`, prompt);

      // 若正文仍标注缺数据，针对缺失项生成补搜查询并重写一次
      if (searchEnabled && text.includes(MISSING_MARK)) {
        checkStopped();
        const queriesText = await callLlm(
          `missing_queries:${title}`,
          `以下是「${state.productName}」调研报告中「${title}」章节的草稿，其中部分数据标注了「${MISSING_MARK}」。请针对这些缺失的数据项，输出最多 4 条用于联网搜索的中文查询词（每行一条，含企业名和具体指标名，不要序号和其他说明）：\n\n${text.slice(0, 3000)}`,
        );
        const queries = queriesText
          .split('\n')
          .map((l) => l.replace(/^[-*\d.\s．、]+/, '').trim())
          .filter(Boolean)
          .slice(0, 4);
        const extra: SearchResultItem[] = [];
        for (const q of queries) {
          checkStopped();
          await progress('web_search', `[子智能体 ${i + 1}] 检测到缺失数据，正在补充搜索：${q}…`);
          extra.push(...(await doSearch(`research:${title}`, q, 5)));
        }
        if (extra.length > 0) {
          await progress('section', `[子智能体 ${i + 1}] 根据补充资料重新完善「${title}」…`);
          const rewritePrompt = `${agent.sectionPrompt}\n产品：${state.productName}\n章节：${title}\n${styleRules}\n${baseContext}\n以下是针对缺失数据补充搜索到的资料：\n${formatRefs(extra)}\n\n这是上一版草稿（部分数据标注了「${MISSING_MARK}」）：\n${text}\n\n请结合补充资料重新输出该章节完整内容（Markdown 格式，不要重复章节标题），尽量用补充资料中的真实数据替换「${MISSING_MARK}」，确实找不到的才保留标注。`;
          text = await callLlm(`section_rewrite:${title}`, rewritePrompt);
        }
      }

      await progress('section', `[子智能体 ${i + 1}] 第 ${i + 1}/${total} 章「${title}」撰写完成`, 'done');
      return `## ${title}\n\n${stripDuplicateTitle(title, text)}`;
    };

    // 主智能体按大纲为每个章节开一个子智能体全并行执行，限流时自动退避重试，完成后按顺序合并
    const sectionsNode = async (state: typeof ResearchState.State) => {
      const total = state.outline.length;
      await progress('section', `主智能体启动 ${total} 个并行子智能体，每章一个，同时开始调研…`);
      const results = await Promise.all(
        state.outline.map((title, idx) => writeSection(state, title, idx, total)),
      );
      await progress('section', `全部 ${total} 个子智能体完成，主智能体正在按顺序合并章节…`, 'done');
      return { sections: results };
    };

    const composeNode = async (state: typeof ResearchState.State) => {
      const startedAt = new Date();
      let markdown = state.sections.join('\n\n');
      if (refList.length > 0) {
        markdown += `\n\n## 参考来源\n\n${refList
          .map((r, i) => `${i + 1}. [${r.name}](${r.url})`)
          .join('\n')}`;
      }
      await this.spans.save(
        this.spans.create({
          trace,
          name: 'compose',
          status: 'done',
          startedAt,
          endedAt: new Date(),
          input: `sections=${state.sections.length}`,
          output: markdown.slice(0, 2000),
        }),
      );
      return { markdown };
    };

    const graph = new StateGraph(ResearchState)
      .addNode('web_search', searchNode)
      .addNode('plan_outline', outlineNode)
      .addNode('write_sections', sectionsNode)
      .addNode('compose_report', composeNode)
      .addEdge(START, 'web_search')
      .addEdge('web_search', 'plan_outline')
      .addEdge('plan_outline', 'write_sections')
      .addEdge('write_sections', 'compose_report')
      .addEdge('compose_report', END)
      .compile();

    try {
      task.status = 'running';
      await this.tasks.save(task);
      await progress('start', `开始调研「${task.productName}」（智能体：${agent.name}，模型：${provider.model}）`);

      const result = await graph.invoke({ productName: task.productName });

      checkStopped();
      await progress('pdf', '正在排版 HTML 报告并生成 PDF…');
      const pdfStart = new Date();
      const pdfPath = await renderPdf(
        `${task.productName} 产品调研报告`,
        result.markdown,
        path.resolve(process.env.DATA_DIR || 'data', 'pdfs'),
      );
      await this.spans.save(
        this.spans.create({
          trace,
          name: 'render_pdf',
          status: 'done',
          startedAt: pdfStart,
          endedAt: new Date(),
          input: task.productName,
          output: pdfPath,
        }),
      );

      task.markdown = result.markdown;
      task.pdfPath = pdfPath;
      task.inputTokens = totalIn;
      task.outputTokens = totalOut;
      task.cost = computeCost(provider, totalIn, totalOut);
      task.status = 'done';
      await this.tasks.save(task);
      await progress('done', '调研完成，PDF 报告已生成', 'done');

      trace.status = 'done';
    } catch (e: any) {
      task.inputTokens = totalIn;
      task.outputTokens = totalOut;
      task.cost = computeCost(provider, totalIn, totalOut);
      if (e instanceof TaskStoppedError) {
        task.status = 'stopped';
        await this.refundIfUsed(task);
        await this.tasks.save(task);
        await progress('stopped', '任务已按用户请求停止', 'stopped');
        trace.status = 'stopped';
      } else {
        this.logger.error(`任务 ${task.id} 失败: ${e?.message ?? e}`);
        task.status = 'failed';
        task.error = String(e?.message ?? e).slice(0, 500);
        await this.refundIfUsed(task);
        await this.tasks.save(task);
        await progress('failed', `调研失败：${task.error}`, 'failed');
        trace.status = 'failed';
      }
    } finally {
      this.stopRequests.delete(task.id);
      trace.endedAt = new Date();
      await this.traces.save(trace);
    }
  }
}
