import {
  BadRequestException,
  Body,
  Controller,
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
import { Agent, Plan, ResearchTask, User } from '../entities';
import { JwtAuthGuard } from '../auth/guards';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ResearchService } from './research.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    @InjectRepository(ResearchTask) private tasks: Repository<ResearchTask>,
    @InjectRepository(Agent) private agents: Repository<Agent>,
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
  async createTask(@Req() req: any, @Body() body: { agentId: number; productName: string }) {
    if (!body.productName?.trim()) throw new BadRequestException('请输入产品名称');
    const agent = await this.agents.findOneBy({ id: body.agentId, active: true });
    if (!agent) throw new NotFoundException('智能体不存在');
    const user = await this.users.findOneBy({ id: req.user.id });
    if (!user) throw new NotFoundException();
    const usedCredit =
      user.role === 'admin' ? false : await this.subscriptions.consumeForTask(user.id);
    const task = await this.tasks.save(
      this.tasks.create({ user, agent, productName: body.productName.trim(), usedCredit }),
    );
    void this.research.run(task.id).catch(() => undefined);
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
    const timer = setInterval(() => {
      void this.tasks.findOne({ where: { id: task.id } }).then((t) => {
        if (t && t.status !== 'pending' && t.status !== 'running') {
          clearInterval(timer);
          unsubscribe();
          send('status', this.dto(t));
          res.end();
        }
      });
    }, 2000);
    res.on('close', () => {
      clearInterval(timer);
      unsubscribe();
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
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      cost: t.cost,
      createdAt: t.createdAt,
      hasPdf: t.status === 'done' && !!t.pdfPath,
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
