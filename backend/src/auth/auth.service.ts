import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ResearchTask, User } from '../entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(ResearchTask) private tasks: Repository<ResearchTask>,
    private jwt: JwtService,
  ) {}

  // 创建游客账号：免登录即可体验生成报告，注册后升级为正式账号
  async guest() {
    const rand = crypto.randomBytes(8).toString('hex');
    const user = this.users.create({
      email: `guest-${rand}@guest.local`,
      passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
      role: 'user',
      isGuest: true,
    });
    await this.users.save(user);
    return this.sign(user);
  }

  async register(email: string, password: string, guestToken?: string) {
    const existing = await this.users.findOneBy({ email });
    if (existing) throw new ConflictException('邮箱已被注册');
    const guest = await this.resolveGuest(guestToken);
    if (guest) {
      // 游客升级为正式账号，保留其已生成的报告
      guest.email = email;
      guest.passwordHash = await bcrypt.hash(password, 10);
      guest.isGuest = false;
      await this.users.save(guest);
      return this.sign(guest);
    }
    const count = await this.users.count();
    const user = this.users.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: count === 0 ? 'admin' : 'user',
    });
    await this.users.save(user);
    return this.sign(user);
  }

  async login(email: string, password: string, guestToken?: string) {
    const user = await this.users.findOneBy({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    const guest = await this.resolveGuest(guestToken);
    if (guest && guest.id !== user.id) {
      // 把游客期间生成的报告归并到登录账号
      await this.tasks
        .createQueryBuilder()
        .update()
        .set({ user: { id: user.id } })
        .where('userId = :gid', { gid: guest.id })
        .execute();
    }
    return this.sign(user);
  }

  private async resolveGuest(guestToken?: string): Promise<User | null> {
    if (!guestToken) return null;
    try {
      const payload = this.jwt.verify<{ sub: number }>(guestToken);
      const user = await this.users.findOneBy({ id: payload.sub });
      return user?.isGuest ? user : null;
    } catch {
      return null;
    }
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || !(await bcrypt.compare(oldPassword, user.passwordHash))) {
      throw new UnauthorizedException('当前密码错误');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.save(user);
    return { ok: true };
  }

  private sign(user: User) {
    return {
      token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        isGuest: user.isGuest,
      }),
      user: { id: user.id, email: user.email, role: user.role, isGuest: user.isGuest },
    };
  }
}
