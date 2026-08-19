import { ChatOpenAI } from '@langchain/openai';
import { Provider } from '../entities';

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function invokeLlm(
  provider: Provider,
  system: string,
  prompt: string,
): Promise<LlmResult> {
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
