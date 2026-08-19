import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchSetting } from '../entities';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { webSearch } from './bocha';

function toDto(s: SearchSetting) {
  return {
    id: s.id,
    provider: s.provider,
    apiKey: s.apiKey ? '••••' + s.apiKey.slice(-4) : '',
    doubaoApiKey: s.doubaoApiKey ? '••••' + s.doubaoApiKey.slice(-4) : '',
    freshness: s.freshness,
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
    if (typeof body.doubaoApiKey === 'string' && !body.doubaoApiKey.startsWith('••••')) {
      s.doubaoApiKey = body.doubaoApiKey;
    }
    if (body.provider === 'bocha' || body.provider === 'doubao') s.provider = body.provider;
    if (['oneDay', 'oneWeek', 'oneMonth', 'oneYear', 'noLimit'].includes(body.freshness)) {
      s.freshness = body.freshness;
    }
    if (body.resultCount != null) s.resultCount = Number(body.resultCount) || 8;
    if (typeof body.enabled === 'boolean') s.enabled = body.enabled;
    return toDto(await this.settings.save(s));
  }

  @Post('test')
  async test(@Body() body: any) {
    const s = await this.getOrCreate();
    const activeKey = s.provider === 'doubao' ? s.doubaoApiKey : s.apiKey;
    if (!activeKey) {
      return {
        ok: false,
        message: s.provider === 'doubao' ? '请先保存豆包搜索 API Key' : '请先保存博查AI API Key',
      };
    }
    try {
      const { items, providerName } = await webSearch(
        { ...s, resultCount: 3 },
        body.query || '小米SU7',
      );
      return { ok: true, provider: providerName, count: items.length, items };
    } catch (e: any) {
      return { ok: false, message: String(e?.message ?? e) };
    }
  }
}
