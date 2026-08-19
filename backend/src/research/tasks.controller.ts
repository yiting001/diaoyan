import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as fs from 'fs';
import { Agent, Plan, Provider, ResearchTask, User } from '../entities';
import { JwtAuthGuard } from '../auth/guards';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ResearchService } from './research.service';

// 无套餐用户可免费生成的报告数量（仅可预览开头，付费后解锁全文）
const FREE_TASK_LIMIT = 3;
// 未解锁报告可预览的正文字符数
const PREVIEW_CHARS = 600;

@Controller()
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    @InjectRepository(ResearchTask) private tasks: Repository<ResearchTask>,
    @InjectRepository(Agent) private agents: Repository<Agent>,
    @InjectRepository(Provider) private providers: Repository<Provider>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Plan) private plans: Repository<Plan>,
    private research: ResearchService,
    private subscriptions: SubscriptionsService,
  ) {}

  @Get('agents')
  listAgents() {
    return this.agents
      .find({ where: { active: true }, order: { id: 'DESC' } })
      .then((list) =>
        list.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          model: a.provider?.model ?? null,
        })),
      );
  }

  // 可供用户选择的模型列表（不暴露 apiKey/baseUrl）
  @Get('models')
  listModels() {
    return this.providers
      .find({ where: { active: true }, order: { id: 'ASC' } })
      .then((list) => list.map((p) => ({ id: p.id, name: p.name, model: p.model })));
  }

  @Get('plans')
  listPlans() {
    return this.plans.find({ where: { active: true }, order: { id: 'ASC' } });
  }

  @Get('me/subscription')
  mySubscription(@Req() req: any) {
    return this.subscriptions.summary(req.user.id);
  }

  @Get('tasks')
  async listTasks(@Req() req: any) {
    const list = await this.tasks.find({
      where: { user: { id: req.user.id } },
      order: { id: 'DESC' },
    });
    return list.map((t) => this.dto(t));
  }

  @Post('tasks')
  async createTask(
    @Req() req: any,
    @Body() body: { agentId: number; productName: string; providerId?: number },
  ) {
    if (!body.productName?.trim()) throw new BadRequestException('请输入产品名称');
    const agent = await this.agents.findOneBy({ id: body.agentId, active: true });
    if (!agent) throw new NotFoundException('智能体不存在');
    let provider: Provider | null = null;
    if (body.providerId) {
      provider = await this.providers.findOneBy({ id: body.providerId, active: true });
      if (!provider) throw new NotFoundException('所选模型不存在或已停用');
    }
    if (!provider && !agent.provider) {
      throw new BadRequestException('请选择模型（该智能体未配置默认模型）');
    }
    const user = await this.users.findOneBy({ id: req.user.id });
    if (!user) throw new NotFoundException();
    let usedCredit = false;
    let unlocked = true;
    if (user.role !== 'admin') {
      const consumed = await this.subscriptions.tryConsumeForTask(user.id);
      if (consumed === null) {
        // 无套餐：允许免费生成但仅可预览开头，付费后解锁全文
        const freeCount = await this.tasks.count({
          where: { user: { id: user.id }, unlocked: false },
        });
        if (freeCount >= FREE_TASK_LIMIT) {
          throw new ForbiddenException('免费体验次数已用完，请购买套餐后继续使用');
        }
        unlocked = false;
      } else {
        usedCredit = consumed;
      }
    }
    const task = await this.tasks.save(
      this.tasks.create({
        user,
        agent,
        provider,
        productName: body.productName.trim(),
        usedCredit,
        unlocked,
      }),
    );
    void this.research.run(task.id).catch(() => undefined);
    return this.dto(task);
  }

  // 付费后解锁报告全文：消耗一次按次额度或年度套餐有效
  @Post('tasks/:id/unlock')
  async unlockTask(@Req() req: any, @Param('id') id: number) {
    const task = await this.findOwned(req, id);
    if (task.unlocked) return this.dto(task);
    if (req.user.isGuest) throw new ForbiddenException('请先注册登录后再解锁报告');
    const consumed = await this.subscriptions.tryConsumeForTask(req.user.id);
    if (consumed === null) throw new ForbiddenException('请先购买套餐后解锁完整报告');
    task.unlocked = true;
    if (consumed) task.usedCredit = true;
    await this.tasks.save(task);
    return this.dto(task);
  }

  @Get('tasks/:id')
  async getTask(@Req() req: any, @Param('id') id: number) {
    const task = await this.findOwned(req, id);
    return this.dto(task);
  }

  @Post('tasks/:id/stop')
  async stopTask(@Req() req: any, @Param('id') id: number) {
    const task = await this.findOwned(req, id);
    if (task.status !== 'pending' && task.status !== 'running') {
      throw new BadRequestException('任务已结束，无法停止');
    }
    this.research.requestStop(task.id);
    return { ok: true };
  }

  @Get('tasks/:id/events')
  async events(@Req() req: any, @Param('id') id: number, @Res() res: Response) {
    const task = await this.findOwned(req, id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let events: unknown[] = [];
    try {
      events = JSON.parse(task.progress || '[]');
    } catch {
      events = [];
    }
    for (const e of events) send('progress', e);

    const finish = async () => {
      const latest = await this.tasks.findOne({ where: { id: task.id } });
      send('status', this.dto(latest ?? task));
      res.end();
    };

    if (task.status !== 'pending' && task.status !== 'running') {
      await finish();
      return;
    }

    const unsubscribe = this.research.subscribe(task.id, (e) => send('progress', e));
    const unsubscribeStream = this.research.subscribeStream(task.id, (e) => send('stream', e));
    const timer = setInterval(() => {
      void this.tasks.findOne({ where: { id: task.id } }).then((t) => {
        if (t && t.status !== 'pending' && t.status !== 'running') {
          clearInterval(timer);
          unsubscribe();
          unsubscribeStream();
          send('status', this.dto(t));
          res.end();
        }
      });
    }, 2000);
    res.on('close', () => {
      clearInterval(timer);
      unsubscribe();
      unsubscribeStream();
    });
  }

  @Get('tasks/:id/pdf')
  async pdf(
    @Req() req: any,
    @Param('id') id: number,
    @Query('download') download: string,
    @Res() res: Response,
  ) {
    const task = await this.findOwned(req, id);
    if (task.status !== 'done' || !task.pdfPath || !fs.existsSync(task.pdfPath)) {
      throw new NotFoundException('报告尚未生成');
    }
    if (!task.unlocked && req.user.role !== 'admin') {
      throw new ForbiddenException('请付费解锁后查看完整报告');
    }
    const filename = encodeURIComponent(`${task.productName}-调研报告.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
    );
    fs.createReadStream(task.pdfPath).pipe(res);
  }

  private async findOwned(req: any, id: number) {
    const task = await this.tasks.findOne({ where: { id } });
    if (!task) throw new NotFoundException();
    if (req.user.role !== 'admin' && task.user.id !== req.user.id) throw new NotFoundException();
    return task;
  }

  private dto(t: ResearchTask) {
    return {
      id: t.id,
      productName: t.productName,
      status: t.status,
      error: t.error,
      agentName: t.agent?.name ?? '',
      model: t.provider?.model ?? t.agent?.provider?.model ?? '',
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      cost: t.cost,
      createdAt: t.createdAt,
      hasPdf: t.status === 'done' && !!t.pdfPath,
      unlocked: t.unlocked,
      preview:
        t.status === 'done' && !t.unlocked ? (t.markdown || '').slice(0, PREVIEW_CHARS) : '',
      progress: (() => {
        try {
          return JSON.parse(t.progress || '[]');
        } catch {
          return [];
        }
      })(),
    };
  }
}
