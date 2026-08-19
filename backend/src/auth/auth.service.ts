import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.users.findOneBy({ email });
    if (existing) throw new ConflictException('邮箱已被注册');
    const count = await this.users.count();
    const user = this.users.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: count === 0 ? 'admin' : 'user',
    });
    await this.users.save(user);
    return this.sign(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOneBy({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    return this.sign(user);
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
      token: this.jwt.sign({ sub: user.id, email: user.email, role: user.role }),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
