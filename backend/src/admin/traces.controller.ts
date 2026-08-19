import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trace } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

@Controller('admin/traces')
@UseGuards(JwtAuthGuard, AdminGuard)
export class TracesController {
  constructor(@InjectRepository(Trace) private traces: Repository<Trace>) {}

  @Get()
  list() {
    return this.traces.find({ order: { id: 'DESC' }, take: 100 });
  }

  @Get(':id')
  async detail(@Param('id') id: number) {
    const trace = await this.traces.findOne({ where: { id }, relations: { spans: true } });
    if (!trace) throw new NotFoundException();
    return trace;
  }
}
