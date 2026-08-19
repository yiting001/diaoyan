import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Agent, Plan, Provider, User } from './entities';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Provider) private providers: Repository<Provider>,
    @InjectRepository(Agent) private agents: Repository<Agent>,
    @InjectRepository(Plan) private plans: Repository<Plan>,
  ) {}

  async onApplicationBootstrap() {
    if ((await this.users.count()) === 0) {
      await this.users.save(
        this.users.create({
          email: 'admin@example.com',
          passwordHash: await bcrypt.hash('admin123', 10),
          role: 'admin',
        }),
      );
    }
    let provider = await this.providers.findOneBy({ type: 'mock' });
    if (!provider) {
      provider = await this.providers.save(
        this.providers.create({
          name: 'Mock 演示供应商',
          type: 'mock',
          model: 'mock',
          inputPricePer1M: 1.0,
          outputPricePer1M: 2.0,
        }),
      );
    }
    if ((await this.agents.count()) === 0) {
      await this.agents.save(
        this.agents.create({
          name: '产品调研专家',
          description: '输入产品名称，自动生成完整的市场调研 PDF 报告',
          systemPrompt:
            '你是一名资深的产品市场调研分析师，输出内容专业、客观、结构化，使用简体中文。',
          outlinePrompt: '请为下列产品设计一份市场调研报告的章节大纲（5-7 个章节）。',
          sectionPrompt: '请撰写调研报告中指定章节的详细内容，条理清晰，可使用列表。',
          provider,
        }),
      );
    }
    if ((await this.plans.count()) === 0) {
      await this.plans.save([
        this.plans.create({
          name: '按次付费',
          description: '每生成一份调研报告收费一次',
          billingType: 'per_use',
          basePrice: 9.9,
        }),
        this.plans.create({
          name: '包年套餐',
          description: '一次付费，全年不限次数使用',
          billingType: 'yearly',
          basePrice: 999,
        }),
        this.plans.create({
          name: '包年 + Token 计价',
          description: '年费基础上按实际 Token 用量计费',
          billingType: 'yearly_plus_token',
          basePrice: 365,
          tokenPricePer1K: 0.02,
        }),
        this.plans.create({
          name: '按次 + Token 计价',
          description: '每次基础费 + 按 Token 用量加收',
          billingType: 'per_use_plus_token',
          basePrice: 2,
          tokenPricePer1K: 0.05,
        }),
      ]);
    }
  }
}
