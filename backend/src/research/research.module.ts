import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent, Plan, ResearchTask, Trace, TraceSpan, UsageRecord, User } from '../entities';
import { ResearchService } from './research.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResearchTask, Agent, User, Plan, Trace, TraceSpan, UsageRecord]),
  ],
  controllers: [TasksController],
  providers: [ResearchService],
})
export class ResearchModule {}
