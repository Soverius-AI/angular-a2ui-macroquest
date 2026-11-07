/** Model transport contract for the byok worker. Implementations own inference. */
import type { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

/** OpenAI-style function definition; the Gemma chat template renders it as a declaration. */
export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: Record<string, unknown> };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** Base64-encoded image bytes, as the AG-UI `image` part carries them. */
export interface ImageInput {
  mimeType: string;
  data: string;
}

export type ChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  /** The model emitted a tool call whose arguments could not be read, even after repair. */
  | { type: 'tool_call_error'; name: string; raw: string; error: string };

export interface ModelClient {
  /** One assistant turn: streamed text and the tool calls the model decided on. */
  streamChat(options: {
    messages: ChatMessage[];
    tools: ToolDefinition[];
    maxTokens: number;
    abortSignal: AbortSignal;
  }): AsyncGenerator<ChatChunk>;

  /** One schema-constrained JSON value, validated by the parser; optionally about an image. */
  completeJson<T>(options: {
    prompt: string;
    schema: JsonSchema;
    parser: z.ZodType<T>;
    image?: ImageInput;
    maxTokens: number;
    abortSignal: AbortSignal;
  }): Promise<T>;
}
