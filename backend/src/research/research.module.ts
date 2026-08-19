import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent, Plan, Provider, ResearchTask, SearchSetting, Trace, TraceSpan, UsageRecord, User } from '../entities';
import { SearchAdminController } from '../search/search-admin.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ResearchService } from './research.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResearchTask, Agent, Provider, User, Plan, Trace, TraceSpan, UsageRecord, SearchSetting]),
    SubscriptionsModule,
  ],
  controllers: [TasksController, SearchAdminController],
  providers: [ResearchService],
})
export class ResearchModule {}
