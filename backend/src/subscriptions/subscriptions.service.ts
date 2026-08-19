import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan, Subscription, User } from '../entities';

export interface SubscriptionSummary {
  remainingUses: number;
  expiresAt: Date | null;
  yearlyActive: boolean;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private subs: Repository<Subscription>,
  ) {}

  async getOrCreate(userId: number): Promise<Subscription> {
    let sub = await this.subs.findOne({ where: { user: { id: userId } } });
    if (!sub) {
      sub = this.subs.create({ user: { id: userId } as User, remainingUses: 0, expiresAt: null });
      await this.subs.save(sub);
      sub = (await this.subs.findOne({ where: { id: sub.id } }))!;
    }
    return sub;
  }

  async summary(userId: number): Promise<SubscriptionSummary> {
    const sub = await this.subs.findOne({ where: { user: { id: userId } } });
    const expiresAt = sub?.expiresAt ?? null;
    return {
      remainingUses: sub?.remainingUses ?? 0,
      expiresAt,
      yearlyActive: !!expiresAt && new Date(expiresAt).getTime() > Date.now(),
    };
  }

  // 购买套餐后发放权益：按次套餐 +1 次，年度套餐延长一年
  async grant(userId: number, plan: Plan): Promise<Subscription> {
    const sub = await this.getOrCreate(userId);
    if (plan.billingType === 'yearly' || plan.billingType === 'yearly_plus_token') {
      const base = sub.expiresAt && new Date(sub.expiresAt).getTime() > Date.now()
        ? new Date(sub.expiresAt)
        : new Date();
      base.setFullYear(base.getFullYear() + 1);
      sub.expiresAt = base;
    } else {
      sub.remainingUses += 1;
    }
    return this.subs.save(sub);
  }

  // 提交任务前校验并扣减额度；返回是否消耗了一次按次额度
  async consumeForTask(userId: number): Promise<boolean> {
    const sub = await this.subs.findOne({ where: { user: { id: userId } } });
    if (sub?.expiresAt && new Date(sub.expiresAt).getTime() > Date.now()) {
      return false;
    }
    if (sub && sub.remainingUses > 0) {
      sub.remainingUses -= 1;
      await this.subs.save(sub);
      return true;
    }
    throw new ForbiddenException('请先购买套餐后再使用智能体');
  }

  // 任务失败/停止时退回按次额度
  async refundCredit(userId: number) {
    const sub = await this.getOrCreate(userId);
    sub.remainingUses += 1;
    await this.subs.save(sub);
  }
}
