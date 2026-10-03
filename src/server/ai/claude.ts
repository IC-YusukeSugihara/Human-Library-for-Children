import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { env } from '../env';

// APIキーはサーバー側だけで使う
const client = new Anthropic({ apiKey: env.anthropicKey, timeout: 60_000, maxRetries: 1 });

export class AiError extends Error {}

export async function askJson<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  user: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
  thinking?: boolean; // false で考える時間を省き、速く返す
}): Promise<z.infer<S>> {
  let res;
  try {
    res = await client.messages.parse({
      model: env.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      ...(opts.thinking === false ? { thinking: { type: 'disabled' as const } } : {}),
      output_config: { effort: opts.effort, format: zodOutputFormat(opts.schema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new AiError('rate_limited');
    if (err instanceof Anthropic.APIError) throw new AiError(`api_error_${err.status ?? 'unknown'}`);
    throw new AiError(err instanceof Error ? err.message : 'unknown');
  }
  if (res.stop_reason === 'refusal') throw new AiError('refusal');
  if (res.stop_reason === 'max_tokens') throw new AiError('max_tokens');
  if (!res.parsed_output) throw new AiError('unparsed');
  return res.parsed_output;
}
