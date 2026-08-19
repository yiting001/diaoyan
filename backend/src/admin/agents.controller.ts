import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent, Provider, ResearchTask } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

@Controller('admin/agents')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AgentsController {
  constructor(
    @InjectRepository(Agent) private agents: Repository<Agent>,
    @InjectRepository(Provider) private providers: Repository<Provider>,
    @InjectRepository(ResearchTask) private tasks: Repository<ResearchTask>,
  ) {}

  @Get()
  list() {
    return this.agents.find({ order: { id: 'DESC' } });
  }

  @Post()
  async create(@Body() body: any) {
    const agent = this.agents.create(await this.fromBody(body));
    return this.agents.save(agent);
  }

  @Put(':id')
  async update(@Param('id') id: number, @Body() body: any) {
    const agent = await this.agents.findOneBy({ id });
    if (!agent) throw new NotFoundException();
    Object.assign(agent, await this.fromBody(body));
    return this.agents.save(agent);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    // 先解除历史任务对该智能体的引用，避免外键冲突
    await this.tasks
      .createQueryBuilder()
      .update()
      .set({ agent: null })
      .where('agentId = :id', { id })
      .execute();
    await this.agents.delete(id);
    return { ok: true };
  }

  private async fromBody(body: any): Promise<Partial<Agent>> {
    const patch: Partial<Agent> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description ?? '';
    if (body.systemPrompt !== undefined) patch.systemPrompt = body.systemPrompt ?? '';
    if (body.outlinePrompt !== undefined) patch.outlinePrompt = body.outlinePrompt ?? '';
    if (body.sectionPrompt !== undefined) patch.sectionPrompt = body.sectionPrompt ?? '';
    if (body.active !== undefined) patch.active = body.active ?? true;
    if (body.providerId !== undefined) {
      patch.provider = body.providerId
        ? await this.providers.findOneBy({ id: body.providerId })
        : null;
    }
    return patch;
  }
}
