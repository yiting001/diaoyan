import { ChatOpenAI } from '@langchain/openai';
import { Provider } from '../entities';

export interface LlmResult {
  text: string;
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
}

export type LlmDelta = { channel: 'reasoning' | 'content'; delta: string };

export async function invokeLlm(
  provider: Provider,
  system: string,
  prompt: string,
  onDelta?: (d: LlmDelta) => void,
): Promise<LlmResult> {
  const chat = new ChatOpenAI({
    apiKey: provider.apiKey,
    model: provider.model,
    configuration: provider.baseUrl ? { baseURL: provider.baseUrl } : undefined,
    temperature: 0.4,
    streamUsage: true,
  });
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ] as const;

  let text = '';
  let reasoning = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await chat.stream([...messages]);
  for await (const chunk of stream) {
    // DeepSeek/豆包等 reasoning 模型的思考内容
    const kw = chunk.additional_kwargs as Record<string, unknown> | undefined;
    const r = typeof kw?.reasoning_content === 'string' ? kw.reasoning_content : '';
    if (r) {
      reasoning += r;
      onDelta?.({ channel: 'reasoning', delta: r });
    }
    const c = typeof chunk.content === 'string' ? chunk.content : '';
    if (c) {
      text += c;
      onDelta?.({ channel: 'content', delta: c });
    }
    if (chunk.usage_metadata) {
      inputTokens = chunk.usage_metadata.input_tokens ?? inputTokens;
      outputTokens = chunk.usage_metadata.output_tokens ?? outputTokens;
    }
  }

  return { text, reasoning, inputTokens, outputTokens };
}

export function computeCost(provider: Provider, inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * (provider.inputPricePer1M || 0) +
    (outputTokens / 1_000_000) * (provider.outputPricePer1M || 0)
  );
}
