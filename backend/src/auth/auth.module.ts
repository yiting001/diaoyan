import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchTask, User } from '../entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ResearchTask]),
    PassportModule,
    JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '7d' } }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
