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
import { formatSearchResults, webSearch } from '../search/bocha';

export interface ProgressEvent {
  time: string;
  step: string;
  message: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
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

    const callLlm = async (nodeName: string, prompt: string) => {
      const startedAt = new Date();
      try {
        const res = await invokeLlm(provider, agent.systemPrompt, prompt);
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
            output: res.text.slice(0, 4000),
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

    const searchNode = async (state: typeof ResearchState.State) => {
      const setting = (await this.searchSettings.find({ take: 1 }))[0];
      if (!setting?.enabled) return {};
      const activeKey = setting.provider === 'doubao' ? setting.doubaoApiKey : setting.apiKey;
      if (!activeKey) return {};
      const providerName = setting.provider === 'doubao' ? '豆包搜索' : '博查AI';
      const startedAt = new Date();
      await progress('web_search', `正在联网搜索最新资料（${providerName}，最新优先）…`);
      try {
        const { items } = await webSearch(
          setting,
          `${state.productName} 最新 产品 调研 评测 市场`,
        );
        const searchContext = formatSearchResults(items);
        const references = items
          .map((r, i) => `${i + 1}. [${r.name}](${r.url})`)
          .join('\n');
        await this.spans.save(
          this.spans.create({
            trace,
            name: `web_search(${providerName})`,
            status: 'done',
            startedAt,
            endedAt: new Date(),
            input: state.productName,
            output: searchContext.slice(0, 4000),
          }),
        );
        await progress('web_search', `搜索完成，获取到 ${items.length} 条最新资料`, 'done');
        return { searchContext, references };
      } catch (e: any) {
        await this.spans.save(
          this.spans.create({
            trace,
            name: `web_search(${providerName})`,
            status: 'failed',
            startedAt,
            endedAt: new Date(),
            input: state.productName,
            output: String(e?.message ?? e).slice(0, 2000),
          }),
        );
        this.logger.warn(`任务 ${task.id} 搜索失败，降级为无搜索模式: ${e?.message ?? e}`);
        await progress('web_search', '联网搜索失败，将在不使用搜索资料的情况下继续调研', 'failed');
        return {};
      }
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

    const sectionsNode = async (state: typeof ResearchState.State) => {
      const sections: string[] = [];
      for (let i = 0; i < state.outline.length; i++) {
        const title = state.outline[i];
        checkStopped();
        await progress('section', `正在撰写第 ${i + 1}/${state.outline.length} 章：${title}…`);
        const prompt = `${agent.sectionPrompt}\n产品：${state.productName}\n章节：${title}\n${withContext(state)}请输出该章节的调研内容（Markdown 格式，不要重复章节标题）。`;
        const text = await callLlm(`section:${title}`, prompt);
        sections.push(`## ${title}\n\n${stripDuplicateTitle(title, text)}`);
        await progress('section', `第 ${i + 1}/${state.outline.length} 章「${title}」撰写完成`, 'done');
      }
      return { sections };
    };

    const composeNode = async (state: typeof ResearchState.State) => {
      const startedAt = new Date();
      let markdown = state.sections.join('\n\n');
      if (state.references) {
        markdown += `\n\n## 参考来源\n\n${state.references}`;
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
