import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

@Controller('admin/plans')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PlansController {
  constructor(@InjectRepository(Plan) private plans: Repository<Plan>) {}

  @Get()
  list() {
    return this.plans.find({ order: { id: 'ASC' } });
  }

  @Post()
  create(@Body() body: any) {
    return this.plans.save(this.plans.create(this.pick(body)));
  }

  @Put(':id')
  async update(@Param('id') id: number, @Body() body: any) {
    const plan = await this.plans.findOneBy({ id });
    if (!plan) throw new NotFoundException();
    Object.assign(plan, this.pick(body));
    return this.plans.save(plan);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    await this.plans.delete(id);
    return { ok: true };
  }

  private pick(body: any): Partial<Plan> {
    return {
      name: body.name,
      description: body.description ?? '',
      billingType: body.billingType ?? 'per_use',
      basePrice: body.basePrice ?? 0,
      tokenPricePer1K: body.tokenPricePer1K ?? 0,
      active: body.active ?? true,
    };
  }
}
