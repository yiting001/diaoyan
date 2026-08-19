import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  PaymentOrder,
  ResearchTask,
  Subscription,
  UsageRecord,
  User,
} from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsersController {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(ResearchTask) private tasks: Repository<ResearchTask>,
    @InjectRepository(UsageRecord) private usage: Repository<UsageRecord>,
    @InjectRepository(PaymentOrder) private orders: Repository<PaymentOrder>,
    @InjectRepository(Subscription) private subs: Repository<Subscription>,
  ) {}

  @Get()
  async list() {
    const users = await this.users.find({ order: { id: 'ASC' } });
    const subs = await this.subs.find();
    const taskCounts = await this.tasks
      .createQueryBuilder('t')
      .select('t.userId', 'userId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.userId')
      .getRawMany();
    const countMap = new Map(taskCounts.map((r) => [Number(r.userId), Number(r.count)]));
    const subMap = new Map(subs.map((s) => [s.user?.id, s]));
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      taskCount: countMap.get(u.id) ?? 0,
      remainingUses: subMap.get(u.id)?.remainingUses ?? 0,
      expiresAt: subMap.get(u.id)?.expiresAt ?? null,
    }));
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: number, @Body() body: any) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('用户不存在');
    if (body.email !== undefined) {
      const email = String(body.email).trim();
      if (!email) throw new BadRequestException('邮箱不能为空');
      const existing = await this.users.findOneBy({ email });
      if (existing && existing.id !== user.id) throw new BadRequestException('邮箱已被占用');
      user.email = email;
    }
    if (body.role !== undefined) {
      if (body.role !== 'user' && body.role !== 'admin') throw new BadRequestException('角色无效');
      if (user.id === req.user.id && body.role !== 'admin') {
        throw new BadRequestException('不能取消自己的管理员权限');
      }
      user.role = body.role;
    }
    await this.users.save(user);
    return { id: user.id, email: user.email, role: user.role };
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: number, @Body() body: { password: string }) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('用户不存在');
    if (!body.password || body.password.length < 6) {
      throw new BadRequestException('新密码至少 6 位');
    }
    user.passwordHash = await bcrypt.hash(body.password, 10);
    await this.users.save(user);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: number) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.id === req.user.id) throw new BadRequestException('不能删除自己的账号');
    // 清理该用户的关联数据后再删除账号
    await this.subs.createQueryBuilder().delete().where('userId = :id', { id }).execute();
    await this.usage.createQueryBuilder().delete().where('userId = :id', { id }).execute();
    await this.orders.createQueryBuilder().delete().where('userId = :id', { id }).execute();
    await this.tasks.createQueryBuilder().delete().where('userId = :id', { id }).execute();
    await this.users.delete(id);
    return { ok: true };
  }
}
