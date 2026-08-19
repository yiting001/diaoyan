import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchSetting } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { bochaWebSearch } from './bocha';

function toDto(s: SearchSetting) {
  return {
    id: s.id,
    apiKey: s.apiKey ? '••••' + s.apiKey.slice(-4) : '',
    resultCount: s.resultCount,
    enabled: s.enabled,
    updatedAt: s.updatedAt,
  };
}

@Controller('admin/search')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SearchAdminController {
  constructor(
    @InjectRepository(SearchSetting) private settings: Repository<SearchSetting>,
  ) {}

  private async getOrCreate(): Promise<SearchSetting> {
    const existing = await this.settings.find({ take: 1 });
    if (existing.length > 0) return existing[0];
    return this.settings.save(this.settings.create({}));
  }

  @Get('config')
  async get() {
    return toDto(await this.getOrCreate());
  }

  @Put('config')
  async update(@Body() body: any) {
    const s = await this.getOrCreate();
    if (typeof body.apiKey === 'string' && !body.apiKey.startsWith('••••')) {
      s.apiKey = body.apiKey;
    }
    if (body.resultCount != null) s.resultCount = Number(body.resultCount) || 8;
    if (typeof body.enabled === 'boolean') s.enabled = body.enabled;
    return toDto(await this.settings.save(s));
  }

  @Post('test')
  async test(@Body() body: any) {
    const s = await this.getOrCreate();
    if (!s.apiKey) return { ok: false, message: '请先保存博查AI API Key' };
    try {
      const items = await bochaWebSearch(s.apiKey, body.query || '小米SU7', 3);
      return { ok: true, count: items.length, items };
    } catch (e: any) {
      return { ok: false, message: String(e?.message ?? e) };
    }
  }
}
