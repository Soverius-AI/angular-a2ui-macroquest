/**
 * Transport to the active OpenAI-compatible chat-completions endpoint
 * (local llama.cpp or OpenRouter). Callers pass fully composed prompts;
 * this module only speaks HTTP and parses/validates the responses.
 */
import type { z } from 'zod';
import { completionUrl, modelApiKey, modelName, modelProvider } from './config';

function modelRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${modelApiKey}`,
  };
  if (modelProvider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://127.0.0.1:4302';
    headers['X-Title'] = 'MacroQuest';
  }
  return headers;
}

function parseModelJsonContent(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Model returned empty content.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error(`Model returned non-JSON content: ${trimmed.slice(0, 200)}`);
  }
}

/**
 * One JSON completion. Prefer response_format json_schema when the provider
 * supports it (llama.cpp compiles it into a grammar); Zod remains the runtime
 * gate. Content may be fenced markdown on some remote models —
 * parseModelJsonContent unwraps that.
 */
export async function completeJson<T>(options: {
  prompt: string;
  imageUrl?: string;
  responseFormat: unknown;
  parser: z.ZodType<T>;
  maxTokens: number;
  temperature: number;
  abortSignal: AbortSignal;
}): Promise<T> {
  const content: Record<string, unknown>[] = [{ type: 'text', text: options.prompt }];
  if (options.imageUrl) {
    content.push({ type: 'image_url', image_url: { url: options.imageUrl } });
  }

  const response = await fetch(completionUrl, {
    method: 'POST',
    headers: modelRequestHeaders(),
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content }],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      response_format: options.responseFormat,
    }),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const raw: string = payload.choices?.[0]?.message?.content ?? '';
  return options.parser.parse(parseModelJsonContent(raw));
}

async function* streamCompletionContent(
  requestBody: Record<string, unknown>,
  abortSignal: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(completionUrl, {
    method: 'POST',
    headers: modelRequestHeaders(),
    body: JSON.stringify({
      model: modelName,
      ...requestBody,
      stream: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;

      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          yield delta;
        }
      } catch {
        // partial line; ignore
      }
    }
  }
}

/** Streams a plain chat completion, yielding text deltas as they arrive. */
export function streamChat(options: {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature: number;
  abortSignal: AbortSignal;
}): AsyncGenerator<string> {
  return streamCompletionContent(
    {
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    },
    options.abortSignal,
  );
}

/**
 * Streams a grammar-constrained JSON object exactly as the model emits it.
 * The Open Generative UI path forwards these chunks as generateSandboxedUi
 * tool arguments, letting CopilotKit's middleware progressively render
 * model-authored CSS and HTML instead of waiting for a server-built widget.
 */
export function streamJson(options: {
  prompt: string;
  responseFormat: unknown;
  maxTokens: number;
  temperature: number;
  abortSignal: AbortSignal;
}): AsyncGenerator<string> {
  return streamCompletionContent(
    {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: options.prompt }],
        },
      ],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      response_format: options.responseFormat,
    },
    options.abortSignal,
  );
}
