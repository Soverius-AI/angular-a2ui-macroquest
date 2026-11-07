/** Environment-neutral model transport contract. Implementations own HTTP or local inference. */
import type { z } from 'zod';

export interface ModelClient {
  completeJson<T>(options: {
    prompt: string;
    imageUrl?: string;
    responseFormat: unknown;
    parser: z.ZodType<T>;
    maxTokens: number;
    temperature: number;
    abortSignal: AbortSignal;
  }): Promise<T>;

  streamChat(options: {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    maxTokens: number;
    temperature: number;
    abortSignal: AbortSignal;
  }): AsyncGenerator<string>;

  streamJson(options: {
    prompt: string;
    responseFormat: unknown;
    maxTokens: number;
    temperature: number;
    abortSignal: AbortSignal;
  }): AsyncGenerator<string>;
}
