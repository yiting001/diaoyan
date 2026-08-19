import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent, Plan, ResearchTask, SearchSetting, Trace, TraceSpan, UsageRecord, User } from '../entities';
import { SearchAdminController } from '../search/search-admin.controller';
import { ResearchService } from './research.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResearchTask, Agent, User, Plan, Trace, TraceSpan, UsageRecord, SearchSetting]),
  ],
  controllers: [TasksController, SearchAdminController],
  providers: [ResearchService],
})
export class ResearchModule {}
