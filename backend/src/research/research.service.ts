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
import { computeCost, invokeLlm } from './llm';
import { renderPdf } from './pdf';
import { bochaWebSearch, formatSearchResults } from '../search/bocha';

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

  constructor(
    @InjectRepository(ResearchTask) private tasks: Repository<ResearchTask>,
    @InjectRepository(Trace) private traces: Repository<Trace>,
    @InjectRepository(TraceSpan) private spans: Repository<TraceSpan>,
    @InjectRepository(UsageRecord) private usage: Repository<UsageRecord>,
    @InjectRepository(SearchSetting) private searchSettings: Repository<SearchSetting>,
  ) {}

  async run(taskId: number) {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task || !task.agent?.provider) {
      if (task) {
        task.status = 'failed';
        task.error = '智能体未配置模型供应商';
        await this.tasks.save(task);
      }
      return;
    }
    const agent = task.agent as Agent;
    const provider = agent.provider as Provider;
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
            model: provider.type === 'mock' ? 'mock' : provider.model,
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
      if (!setting?.enabled || !setting.apiKey) return {};
      const startedAt = new Date();
      try {
        const items = await bochaWebSearch(
          setting.apiKey,
          `${state.productName} 最新 产品 调研 评测 市场`,
          setting.resultCount || 8,
        );
        const searchContext = formatSearchResults(items);
        const references = items
          .map((r, i) => `${i + 1}. [${r.name}](${r.url})`)
          .join('\n');
        await this.spans.save(
          this.spans.create({
            trace,
            name: 'web_search(博查AI)',
            status: 'done',
            startedAt,
            endedAt: new Date(),
            input: state.productName,
            output: searchContext.slice(0, 4000),
          }),
        );
        return { searchContext, references };
      } catch (e: any) {
        await this.spans.save(
          this.spans.create({
            trace,
            name: 'web_search(博查AI)',
            status: 'failed',
            startedAt,
            endedAt: new Date(),
            input: state.productName,
            output: String(e?.message ?? e).slice(0, 2000),
          }),
        );
        this.logger.warn(`任务 ${task.id} 搜索失败，降级为无搜索模式: ${e?.message ?? e}`);
        return {};
      }
    };

    const withContext = (state: typeof ResearchState.State) =>
      state.searchContext
        ? `\n以下是通过联网搜索获取的最新资料，请优先基于这些资料撰写，并在正文中用 [n] 标注引用：\n${state.searchContext}\n`
        : '';

    const outlineNode = async (state: typeof ResearchState.State) => {
      const prompt = `${agent.outlinePrompt}\n[OUTLINE]\n产品：${state.productName}\n${withContext(state)}请直接输出章节标题列表，每行一个，不要编号。`;
      const text = await callLlm('outline', prompt);
      const outline = text
        .split('\n')
        .map((l) => l.replace(/^[-*\d.\s\[\]+]+/, '').trim())
        .filter(Boolean)
        .slice(0, 8);
      return { outline };
    };

    const sectionsNode = async (state: typeof ResearchState.State) => {
      const sections: string[] = [];
      for (const title of state.outline) {
        const prompt = `${agent.sectionPrompt}\n产品：${state.productName}\n章节：${title}\n${withContext(state)}请输出该章节的调研内容（Markdown 格式，不要重复章节标题）。`;
        const text = await callLlm(`section:${title}`, prompt);
        sections.push(`## ${title}\n\n${text}`);
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

      const result = await graph.invoke({ productName: task.productName });

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

      trace.status = 'done';
    } catch (e: any) {
      this.logger.error(`任务 ${task.id} 失败: ${e?.message ?? e}`);
      task.status = 'failed';
      task.error = String(e?.message ?? e).slice(0, 500);
      task.inputTokens = totalIn;
      task.outputTokens = totalOut;
      task.cost = computeCost(provider, totalIn, totalOut);
      await this.tasks.save(task);
      trace.status = 'failed';
    } finally {
      trace.endedAt = new Date();
      await this.traces.save(trace);
    }
  }
}
