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
import { Provider } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';

function masked(p: Provider) {
  return { ...p, apiKey: p.apiKey ? '••••' + p.apiKey.slice(-4) : '' };
}

@Controller('admin/providers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ProvidersController {
  constructor(@InjectRepository(Provider) private providers: Repository<Provider>) {}

  @Get()
  async list() {
    return (await this.providers.find({ order: { id: 'DESC' } })).map(masked);
  }

  @Post()
  async create(@Body() body: any) {
    const p = this.providers.create({
      name: body.name,
      type: body.type ?? 'openai-compatible',
      baseUrl: body.baseUrl ?? '',
      apiKey: body.apiKey ?? '',
      model: body.model ?? '',
      inputPricePer1M: body.inputPricePer1M ?? 0,
      outputPricePer1M: body.outputPricePer1M ?? 0,
      active: body.active ?? true,
    });
    return masked(await this.providers.save(p));
  }

  @Put(':id')
  async update(@Param('id') id: number, @Body() body: any) {
    const p = await this.providers.findOneBy({ id });
    if (!p) throw new NotFoundException();
    const { apiKey, ...rest } = body;
    Object.assign(p, rest);
    if (apiKey && !apiKey.startsWith('••••')) p.apiKey = apiKey;
    return masked(await this.providers.save(p));
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    await this.providers.delete(id);
    return { ok: true };
  }
}
