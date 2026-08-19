import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import {
  Agent,
  Plan,
  Provider,
  ResearchTask,
  Trace,
  TraceSpan,
  UsageRecord,
  User,
} from './entities';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ResearchModule } from './research/research.module';
import { SeedService } from './seed.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: path.resolve(process.env.DATA_DIR || 'data', 'app.sqlite'),
      entities: [User, Provider, Agent, ResearchTask, UsageRecord, Trace, TraceSpan, Plan],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User, Provider, Agent, Plan]),
    AuthModule,
    AdminModule,
    ResearchModule,
  ],
  providers: [SeedService],
})
export class AppModule {}
