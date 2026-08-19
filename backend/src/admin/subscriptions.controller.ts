import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan, Subscription, User } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSubscriptionsController {
  constructor(
    @InjectRepository(Subscription) private subs: Repository<Subscription>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Plan) private plans: Repository<Plan>,
    private subscriptions: SubscriptionsService,
  ) {}

  @Get()
  async list() {
    const list = await this.subs.find({ order: { id: 'DESC' } });
    return list.map((s) => ({
      id: s.id,
      email: s.user?.email ?? '',
      remainingUses: s.remainingUses,
      expiresAt: s.expiresAt,
      updatedAt: s.updatedAt,
    }));
  }

  // 手动为用户开通套餐（等同于支付成功一次）
  @Post('grant')
  async grant(@Body() body: { email: string; planId: number }) {
    if (!body.email?.trim()) throw new BadRequestException('请输入用户邮箱');
    const user = await this.users.findOneBy({ email: body.email.trim() });
    if (!user) throw new NotFoundException('用户不存在');
    const plan = await this.plans.findOneBy({ id: body.planId });
    if (!plan) throw new NotFoundException('套餐不存在');
    const sub = await this.subscriptions.grant(user.id, plan);
    return { ok: true, remainingUses: sub.remainingUses, expiresAt: sub.expiresAt };
  }
}
