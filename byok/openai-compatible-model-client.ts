/**
 * ModelClient over an OpenAI-compatible chat-completions API (OpenRouter, or Gemini's
 * OpenAI endpoint), called straight from the worker. The API key lives only in this
 * object's closure: it is never written to storage and goes to nothing but `baseUrl`.
 */
import { jsonrepair } from 'jsonrepair';
import type {
  ChatChunk,
  ChatMessage,
  ImageInput,
  ModelClient,
  ToolDefinition,
} from './model-client';

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Provider-specific extra headers, such as OpenRouter's X-Title attribution. */
  headers?: Record<string, string>;
  /** Provider-specific request fields, such as a reasoning-effort setting. */
  body?: Record<string, unknown>;
  fetch?: typeof fetch;
}

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string | Record<string, unknown>[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((message) => {
    if (message.role === 'assistant')
      return {
        role: 'assistant',
        content: message.content || null,
        ...(message.tool_calls?.length
          ? {
              tool_calls: message.tool_calls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: {
                  name: call.function.name,
                  arguments: JSON.stringify(call.function.arguments),
                },
              })),
            }
          : {}),
      };
    if (message.role === 'tool')
      return { role: 'tool', tool_call_id: message.tool_call_id, content: message.content };
    return { role: message.role, content: message.content };
  });
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  return JSON.parse(fence ? fence[1]! : trimmed);
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue; // comments such as ": OPENROUTER PROCESSING"
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      if (data) yield data;
    }
    if (done) return;
  }
}

export function createOpenAICompatibleModelClient(options: OpenAICompatibleOptions): ModelClient {
  const doFetch = options.fetch ?? fetch;
  async function post(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
    const response = await doFetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        ...options.headers,
      },
      body: JSON.stringify({ model: options.model, ...options.body, ...body }),
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload.error?.message) detail = `${detail}: ${payload.error.message}`;
      } catch {
        /* keep the status */
      }
      throw new Error(`The model request failed (${detail}).`);
    }
    return response;
  }

  return {
    async *streamChat(input) {
      const response = await post(
        {
          messages: toOpenAIMessages(input.messages),
          ...(input.tools.length ? { tools: input.tools } : {}),
          stream: true,
          max_tokens: input.maxTokens,
        },
        input.abortSignal,
      );
      if (!response.body) throw new Error('The model returned no response body.');
      const calls = new Map<number, { id: string; name: string; args: string }>();
      let finishReason: string | undefined;
      let spoke = false;
      for await (const data of sseData(response.body)) {
        const chunk = JSON.parse(data) as {
          error?: { message?: string };
          choices?: {
            finish_reason?: string | null;
            delta?: {
              content?: string | null;
              tool_calls?: {
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }[];
            };
          }[];
        };
        if (chunk.error) throw new Error(`Model stream error: ${chunk.error.message ?? ''}`);
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const delta = choice?.delta;
        if (!delta) continue;
        if (delta.content) {
          spoke = true;
          yield { type: 'text', delta: delta.content };
        }
        for (const part of delta.tool_calls ?? []) {
          const index = part.index ?? 0;
          const call = calls.get(index) ?? { id: '', name: '', args: '' };
          if (part.id) call.id = part.id;
          if (part.function?.name) call.name = part.function.name;
          if (part.function?.arguments) call.args += part.function.arguments;
          calls.set(index, call);
        }
      }
      if (!spoke && calls.size === 0)
        throw new Error(
          `The model returned an empty turn (finish reason: ${finishReason ?? 'unknown'}). With reasoning models this usually means the output budget was spent on reasoning.`,
        );
      for (const call of calls.values()) {
        let parsed: unknown;
        try {
          parsed = call.args ? JSON.parse(call.args) : {};
        } catch (error) {
          try {
            parsed = JSON.parse(jsonrepair(call.args));
          } catch {
            yield {
              type: 'tool_call_error',
              name: call.name,
              raw: call.args,
              error: error instanceof Error ? error.message : String(error),
            } satisfies ChatChunk;
            continue;
          }
        }
        yield {
          type: 'tool_call',
          name: call.name,
          arguments:
            parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : { value: parsed },
        } satisfies ChatChunk;
      }
    },
    async completeJson(input) {
      const content = (prompt: string, image?: ImageInput) =>
        image
          ? [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${image.data}` },
              },
            ]
          : prompt;
      const messages: OpenAIMessage[] = [
        { role: 'user', content: content(input.prompt, input.image) },
      ];
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await post(
          {
            messages,
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'result', strict: true, schema: input.schema },
            },
            max_tokens: input.maxTokens,
          },
          input.abortSignal,
        );
        const payload = (await response.json()) as {
          choices?: { message?: { content?: string | null } }[];
        };
        const text = payload.choices?.[0]?.message?.content ?? '';
        try {
          return input.parser.parse(parseJson(text));
        } catch (error) {
          if (attempt === 1)
            throw new Error('The model JSON failed schema validation after one feedback retry.', {
              cause: error,
            });
          messages.push(
            { role: 'assistant', content: text },
            {
              role: 'user',
              content: `The previous response failed JSON/schema validation: ${String(error).slice(0, 3000)}. Return corrected JSON only, following the original schema.`,
            },
          );
        }
      }
      throw new Error('Unreachable JSON generation state.');
    },
  };
}
