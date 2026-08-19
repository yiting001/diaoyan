import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentOrder, PaySetting, Plan } from '../entities';
import { PayService } from './pay.service';
import { PayController } from './pay.controller';
import { PayAdminController } from './pay-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PaySetting, PaymentOrder, Plan])],
  providers: [PayService],
  controllers: [PayController, PayAdminController],
})
export class PayModule {}
