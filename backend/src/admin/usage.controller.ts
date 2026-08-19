import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageRecord } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

@Controller('admin/usage')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsageController {
  constructor(@InjectRepository(UsageRecord) private usage: Repository<UsageRecord>) {}

  @Get()
  async list() {
    return this.usage.find({ order: { id: 'DESC' }, take: 200 });
  }

  @Get('summary')
  async summary() {
    const totals = await this.usage
      .createQueryBuilder('u')
      .select('SUM(u.inputTokens)', 'inputTokens')
      .addSelect('SUM(u.outputTokens)', 'outputTokens')
      .addSelect('SUM(u.cost)', 'cost')
      .addSelect('COUNT(*)', 'calls')
      .getRawOne();
    const byModel = await this.usage
      .createQueryBuilder('u')
      .select('u.model', 'model')
      .addSelect('SUM(u.inputTokens)', 'inputTokens')
      .addSelect('SUM(u.outputTokens)', 'outputTokens')
      .addSelect('SUM(u.cost)', 'cost')
      .addSelect('COUNT(*)', 'calls')
      .groupBy('u.model')
      .getRawMany();
    const byUser = await this.usage
      .createQueryBuilder('u')
      .leftJoin('u.user', 'user')
      .select('user.email', 'email')
      .addSelect('SUM(u.inputTokens)', 'inputTokens')
      .addSelect('SUM(u.outputTokens)', 'outputTokens')
      .addSelect('SUM(u.cost)', 'cost')
      .groupBy('user.email')
      .getRawMany();
    return { totals, byModel, byUser };
  }
}
