import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent, Plan, Provider, Trace, UsageRecord, ResearchTask } from '../entities';
import { AgentsController } from './agents.controller';
import { ProvidersController } from './providers.controller';
import { PlansController } from './plans.controller';
import { UsageController } from './usage.controller';
import { TracesController } from './traces.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, Provider, Plan, UsageRecord, Trace, ResearchTask])],
  controllers: [AgentsController, ProvidersController, PlansController, UsageController, TracesController],
})
export class AdminModule {}
