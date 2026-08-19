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
          model: a.provider ? (a.provider.type === 'mock' ? 'mock' : a.provider.model) : null,
        })),
      );
  }

  @Get('plans')
  listPlans() {
    return this.plans.find({ where: { active: true }, order: { id: 'ASC' } });
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
    const task = await this.tasks.save(
      this.tasks.create({ user, agent, productName: body.productName.trim() }),
    );
    void this.research.run(task.id).catch(() => undefined);
    return this.dto(task);
  }

  @Get('tasks/:id')
  async getTask(@Req() req: any, @Param('id') id: number) {
    const task = await this.findOwned(req, id);
    return this.dto(task);
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
    };
  }
}
