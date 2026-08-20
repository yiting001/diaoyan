import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Agent, Plan, User } from './entities';
import {
  FANFU_AGENT_DESCRIPTION,
  FANFU_AGENT_NAME,
  FANFU_OUTLINE_PROMPT,
  FANFU_SECTION_PROMPT,
  FANFU_SYSTEM_PROMPT,
} from './research/fanfu-prompts';
import {
  MINING_AGENT_DESCRIPTION,
  MINING_AGENT_NAME,
  MINING_OUTLINE_PROMPT,
  MINING_SECTION_PROMPT,
  MINING_SYSTEM_PROMPT,
} from './research/fanfu-mining-prompts';
import {
  ENERGY_AGENT_DESCRIPTION,
  ENERGY_AGENT_NAME,
  ENERGY_OUTLINE_PROMPT,
  ENERGY_SECTION_PROMPT,
  ENERGY_SYSTEM_PROMPT,
} from './research/fanfu-energy-prompts';
import {
  SEVENTEEN_AGENT_DESCRIPTION,
  SEVENTEEN_AGENT_NAME,
  SEVENTEEN_OUTLINE_PROMPT,
  SEVENTEEN_SECTION_PROMPT,
  SEVENTEEN_SYSTEM_PROMPT,
} from './research/fanfu-seventeen-prompts';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
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
    if ((await this.agents.count()) === 0) {
      await this.agents.save(
        this.agents.create({
          name: FANFU_AGENT_NAME,
          description: FANFU_AGENT_DESCRIPTION,
          systemPrompt: FANFU_SYSTEM_PROMPT,
          outlinePrompt: FANFU_OUTLINE_PROMPT,
          sectionPrompt: FANFU_SECTION_PROMPT,
        }),
      );
    }
    if ((await this.agents.countBy({ name: MINING_AGENT_NAME })) === 0) {
      await this.agents.save(
        this.agents.create({
          name: MINING_AGENT_NAME,
          description: MINING_AGENT_DESCRIPTION,
          systemPrompt: MINING_SYSTEM_PROMPT,
          outlinePrompt: MINING_OUTLINE_PROMPT,
          sectionPrompt: MINING_SECTION_PROMPT,
        }),
      );
    }
    if ((await this.agents.countBy({ name: ENERGY_AGENT_NAME })) === 0) {
      await this.agents.save(
        this.agents.create({
          name: ENERGY_AGENT_NAME,
          description: ENERGY_AGENT_DESCRIPTION,
          systemPrompt: ENERGY_SYSTEM_PROMPT,
          outlinePrompt: ENERGY_OUTLINE_PROMPT,
          sectionPrompt: ENERGY_SECTION_PROMPT,
        }),
      );
    }
    if ((await this.agents.countBy({ name: SEVENTEEN_AGENT_NAME })) === 0) {
      await this.agents.save(
        this.agents.create({
          name: SEVENTEEN_AGENT_NAME,
          description: SEVENTEEN_AGENT_DESCRIPTION,
          systemPrompt: SEVENTEEN_SYSTEM_PROMPT,
          outlinePrompt: SEVENTEEN_OUTLINE_PROMPT,
          sectionPrompt: SEVENTEEN_SECTION_PROMPT,
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
