import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent, Plan, Provider, Subscription, Trace, UsageRecord, ResearchTask, User } from '../entities';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSubscriptionsController } from './subscriptions.controller';
import { AgentsController } from './agents.controller';
import { ProvidersController } from './providers.controller';
import { PlansController } from './plans.controller';
import { UsageController } from './usage.controller';
import { TracesController } from './traces.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agent, Provider, Plan, UsageRecord, Trace, ResearchTask, Subscription, User]),
    SubscriptionsModule,
  ],
  controllers: [
    AgentsController,
    ProvidersController,
    PlansController,
    UsageController,
    TracesController,
    AdminSubscriptionsController,
  ],
})
export class AdminModule {}
