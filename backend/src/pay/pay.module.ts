import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentOrder, PaySetting, Plan } from '../entities';
import { PayService } from './pay.service';
import { PayController } from './pay.controller';
import { PayAdminController } from './pay-admin.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [TypeOrmModule.forFeature([PaySetting, PaymentOrder, Plan]), SubscriptionsModule],
  providers: [PayService],
  controllers: [PayController, PayAdminController],
})
export class PayModule {}
