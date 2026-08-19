import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ default: 'user' })
  role: 'user' | 'admin';

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // 'openai-compatible' | 'mock'
  @Column({ default: 'openai-compatible' })
  type: string;

  @Column({ default: '' })
  baseUrl: string;

  @Column({ default: '' })
  apiKey: string;

  @Column({ default: 'gpt-4o-mini' })
  model: string;

  // price in USD per 1M tokens
  @Column('float', { default: 0 })
  inputPricePer1M: number;

  @Column('float', { default: 0 })
  outputPricePer1M: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column('text', { default: '' })
  systemPrompt: string;

  @Column('text', { default: '' })
  outlinePrompt: string;

  @Column('text', { default: '' })
  sectionPrompt: string;

  @ManyToOne(() => Provider, { nullable: true, eager: true })
  provider: Provider | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('research_tasks')
export class ResearchTask {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @ManyToOne(() => Agent, { eager: true, nullable: true })
  agent: Agent | null;

  @Column()
  productName: string;

  // pending | running | done | failed
  @Column({ default: 'pending' })
  status: string;

  @Column({ default: '' })
  error: string;

  @Column('text', { default: '' })
  markdown: string;

  @Column({ default: '' })
  pdfPath: string;

  @Column('int', { default: 0 })
  inputTokens: number;

  @Column('int', { default: 0 })
  outputTokens: number;

  @Column('float', { default: 0 })
  cost: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('usage_records')
export class UsageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @ManyToOne(() => Provider, { eager: true, nullable: true })
  provider: Provider | null;

  @Column('int', { nullable: true })
  taskId: number | null;

  @Column({ default: '' })
  model: string;

  @Column('int', { default: 0 })
  inputTokens: number;

  @Column('int', { default: 0 })
  outputTokens: number;

  @Column('float', { default: 0 })
  cost: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('traces')
export class Trace {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  taskId: number;

  @Column()
  name: string;

  // running | done | failed
  @Column({ default: 'running' })
  status: string;

  @Column('datetime', { nullable: true })
  startedAt: Date;

  @Column('datetime', { nullable: true })
  endedAt: Date;

  @OneToMany(() => TraceSpan, (s) => s.trace, { eager: true, cascade: true })
  spans: TraceSpan[];
}

@Entity('trace_spans')
export class TraceSpan {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Trace, (t) => t.spans, { onDelete: 'CASCADE' })
  trace: Trace;

  @Column()
  name: string;

  @Column({ default: 'done' })
  status: string;

  @Column('datetime', { nullable: true })
  startedAt: Date;

  @Column('datetime', { nullable: true })
  endedAt: Date;

  @Column('text', { default: '' })
  input: string;

  @Column('text', { default: '' })
  output: string;

  @Column('int', { default: 0 })
  inputTokens: number;

  @Column('int', { default: 0 })
  outputTokens: number;
}

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  // per_use | yearly | yearly_plus_token | per_use_plus_token
  @Column({ default: 'per_use' })
  billingType: string;

  // base price in CNY: per-use price or yearly price
  @Column('float', { default: 0 })
  basePrice: number;

  // token price in CNY per 1K tokens (for *_plus_token types)
  @Column('float', { default: 0 })
  tokenPricePer1K: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
