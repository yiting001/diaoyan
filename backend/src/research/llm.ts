import { ChatOpenAI } from '@langchain/openai';
import { Provider } from '../entities';

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

function mockCompletion(system: string, prompt: string): LlmResult {
  const product = /产品[:：]\s*([^\n]+)/.exec(prompt)?.[1]?.trim() || '目标产品';
  let text: string;
  if (prompt.includes('[OUTLINE]')) {
    text = ['产品概述', '市场分析', '竞品对比', '用户画像', 'SWOT 分析', '总结与建议'].join('\n');
  } else {
    const section = /章节[:：]\s*([^\n]+)/.exec(prompt)?.[1]?.trim() || '分析';
    text = [
      `${product} 的「${section}」如下：`,
      '',
      `- [+] ${section}要点一：${product} 在该维度表现出较强的市场潜力，值得持续关注。`,
      `- [+] ${section}要点二：结合行业公开数据与常见评估框架，${product} 的定位清晰。`,
      `- [-] 风险提示：以上内容由演示用 Mock 模型生成，仅用于功能演示，不构成真实调研结论。`,
      '',
      `综合来看，${product} 在「${section}」维度具备进一步深入调研的价值。`,
    ].join('\n');
  }
  const estimate = (s: string) => Math.max(1, Math.round(s.length / 3));
  return { text, inputTokens: estimate(system + prompt), outputTokens: estimate(text) };
}

export async function invokeLlm(
  provider: Provider,
  system: string,
  prompt: string,
): Promise<LlmResult> {
  if (provider.type === 'mock') {
    await new Promise((r) => setTimeout(r, 300));
    return mockCompletion(system, prompt);
  }
  const chat = new ChatOpenAI({
    apiKey: provider.apiKey,
    model: provider.model,
    configuration: provider.baseUrl ? { baseURL: provider.baseUrl } : undefined,
    temperature: 0.4,
  });
  const res = await chat.invoke([
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ]);
  const usage = res.usage_metadata;
  return {
    text: typeof res.content === 'string' ? res.content : JSON.stringify(res.content),
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}

export function computeCost(provider: Provider, inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * (provider.inputPricePer1M || 0) +
    (outputTokens / 1_000_000) * (provider.outputPricePer1M || 0)
  );
}
