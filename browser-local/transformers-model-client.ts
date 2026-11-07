import type { ModelClient } from '../shared/macroquest-agent/model-client';
import { z } from 'zod';

export const TRANSFORMERS_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
export const TRANSFORMERS_MODEL_REVISION = '6f21c99d7e18237f8d2ce92aadfdbfeba877f63a';
const MAX_OUTPUT_TOKENS = 3000;
const MAX_CONTEXT_TOKENS = 8192;
const runtimeNote =
  'Execution environment: browser-local Gemma 4 E2B via Transformers.js and ONNX Runtime Web, not llama.cpp. Text-only: ask for meal descriptions, not photos. Label mealDraft sources as browser-local Gemma 4 E2B ONNX.';
const sandboxWidget = z
  .object({
    initialHeight: z.number().min(100).max(2000),
    placeholderMessages: z.array(z.string()),
    css: z.string(),
    html: z.string().min(1),
    jsFunctions: z.string().min(1),
    jsExpressions: z.array(z.string().min(1)).length(1),
  })
  .strict();
type Message = { role: 'system' | 'user' | 'assistant'; content: string };
/** Deliberately small injectable SDK surface; importing this module never loads native ORT. */
export interface TransformersDependencies {
  tokenizer: {
    apply_chat_template(
      messages: Message[],
      options: Record<string, unknown>,
    ): Record<string, unknown>;
  };
  model: {
    generate(options: Record<string, unknown>): Promise<unknown>;
    dispose(): Promise<unknown>;
  };
  createStreamer(callback: (text: string) => void): unknown;
  createStoppingCriteria(): { interrupt(): void; reset(): void };
  createStoppingCriteriaList(criteria: unknown): unknown;
}
function check(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException('Inference cancelled.', 'AbortError');
}
async function disposeTensors(value: unknown, seen = new Set<unknown>()): Promise<void> {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if ('dispose' in value && typeof value.dispose === 'function') {
    await value.dispose();
  } else {
    for (const child of Object.values(value)) await disposeTensors(child, seen);
  }
}
function schemaPrompt(prompt: string, format: unknown): string {
  if (!format || typeof format !== 'object' || !('json_schema' in format))
    throw new Error('Expected a json_schema response format.');
  const schema = (format as { json_schema?: { schema?: unknown } }).json_schema?.schema;
  if (!schema || typeof schema !== 'object') throw new Error('Missing JSON schema.');
  return `${prompt}\n\n${runtimeNote}\nReturn ONLY one JSON value matching this JSON schema (no commentary):\n${JSON.stringify(schema)}`;
}
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
  return JSON.parse(fence ? fence[1]! : trimmed);
}

/** No worker is created here: invoke from the caller's dedicated module worker. */
export function createTransformersModelClient(deps: TransformersDependencies): {
  client: ModelClient;
  dispose: () => Promise<void>;
} {
  let busy = false;
  let disposed = false;
  let active: Promise<void> | undefined;
  let interrupt: (() => void) | undefined;
  let disposal: Promise<void> | undefined;
  function acquire(): void {
    if (disposed) throw new Error('The local model has been disposed.');
    if (busy) throw new Error('Concurrent local inference is unsupported; serialize requests.');
    busy = true;
  }
  async function* generate(
    messages: Message[],
    maxTokens: number,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    check(signal);
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_OUTPUT_TOKENS)
      throw new Error(
        `maxTokens must be between 1 and ${MAX_OUTPUT_TOKENS}; output is never silently truncated.`,
      );
    if (messages.reduce((n, m) => n + m.content.length, 0) > 64000)
      throw new Error('Prompt is too large; shorten the conversation.');
    const criteria = deps.createStoppingCriteria();
    criteria.reset();
    interrupt = () => criteria.interrupt();
    signal.addEventListener('abort', interrupt, { once: true });
    const chunks: string[] = [];
    let wake: (() => void) | undefined;
    let done = false;
    let failure: unknown;
    let failed = false;
    let inputs: Record<string, unknown> | undefined;
    try {
      inputs = deps.tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        enable_thinking: false,
        tokenize: true,
        return_dict: true,
      });
      const ids = inputs['input_ids'] as { dims?: number[] } | undefined;
      const length = ids?.dims?.at(-1);
      if (length !== undefined && length + maxTokens > MAX_CONTEXT_TOKENS)
        throw new Error(
          `Prompt plus output exceeds the ${MAX_CONTEXT_TOKENS}-token context budget; shorten the conversation.`,
        );
      check(signal);
      const streamer = deps.createStreamer((text) => {
        if (text && !signal.aborted && !disposed) {
          chunks.push(text);
          wake?.();
        }
      });
      // Keep the entire generation AND output cleanup in-flight until safe to dispose the model.
      active = (async () => {
        let output: unknown;
        try {
          output = await deps.model.generate({
            ...inputs,
            max_new_tokens: maxTokens,
            do_sample: false,
            streamer,
            stopping_criteria: deps.createStoppingCriteriaList(criteria),
          });
          const sequences =
            output && typeof output === 'object' && 'sequences' in output
              ? output.sequences
              : output;
          const outputLength = (sequences as { dims?: number[] } | undefined)?.dims?.at(-1);
          if (
            length !== undefined &&
            outputLength !== undefined &&
            outputLength - length >= maxTokens
          )
            throw new Error(
              'Local generation reached the output token limit; response may be incomplete.',
            );
        } catch (error) {
          failed = true;
          failure = error;
          if (!signal.aborted)
            console.error(
              '[transformers] Generation failed; check ONNX assets/device memory.',
              error,
            );
        } finally {
          try {
            await disposeTensors(output);
          } catch (error) {
            failed = true;
            failure = error;
          }
          done = true;
          wake?.();
        }
      })();
      while (!done || chunks.length) {
        check(signal);
        if (disposed) throw new Error('The local model has been disposed.');
        if (chunks.length) yield chunks.shift()!;
        else
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
      }
      check(signal);
      if (failed) throw failure;
    } finally {
      criteria.interrupt();
      signal.removeEventListener('abort', interrupt!);
      await active;
      await disposeTensors(inputs);
      interrupt = undefined;
      active = undefined;
      criteria.reset();
    }
  }
  const client: ModelClient = {
    async *streamChat(input) {
      acquire();
      try {
        const messages =
          input.messages[0]?.role === 'system'
            ? input.messages.map((message, index) =>
                index === 0
                  ? { ...message, content: `${message.content}\n\n${runtimeNote}` }
                  : message,
              )
            : [{ role: 'system' as const, content: runtimeNote }, ...input.messages];
        yield* generate(messages, input.maxTokens, input.abortSignal);
      } finally {
        busy = false;
      }
    },
    async *streamJson(input) {
      // The SDK does not enforce arbitrary JSON-schema grammars. Buffer and validate
      // the complete model-authored payload before exposing any executable content.
      const widget = await client.completeJson({ ...input, parser: sandboxWidget });
      check(input.abortSignal);
      yield JSON.stringify({
        initialHeight: widget.initialHeight,
        placeholderMessages: widget.placeholderMessages,
        css: widget.css,
        html: widget.html,
        jsFunctions: widget.jsFunctions,
        jsExpressions: widget.jsExpressions,
      });
    },
    async completeJson(input) {
      if (input.imageUrl)
        throw new Error('Image input is unsupported: this local adapter is text-only.');
      acquire();
      try {
        const messages: Message[] = [
          { role: 'user', content: schemaPrompt(input.prompt, input.responseFormat) },
        ];
        for (let attempt = 0; attempt < 2; attempt++) {
          let text = '';
          for await (const chunk of generate(messages, input.maxTokens, input.abortSignal))
            text += chunk;
          check(input.abortSignal);
          try {
            return input.parser.parse(parseJson(text));
          } catch (error) {
            if (attempt === 1)
              throw new Error(
                'Local model JSON failed schema validation after one feedback retry.',
                { cause: error },
              );
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
      } finally {
        busy = false;
      }
    },
  };
  return {
    client,
    dispose() {
      if (!disposal) {
        disposed = true;
        interrupt?.();
        disposal = (async () => {
          await active;
          await deps.model.dispose();
        })();
      }
      return disposal;
    },
  };
}

export interface LoadBrowserModelOptions {
  model: string;
  wasmUrl: string;
  cache?: boolean;
  allowWasmFallback?: boolean;
  onProgress?: (message: string) => void;
}
/** Configure the installed SDK's own ORT runtime, never an independently versioned CDN runtime. */
export interface TransformersEnvironment {
  useBrowserCache: boolean;
  useWasmCache: boolean;
  allowLocalModels: boolean;
  backends: { onnx: { wasm?: { wasmPaths?: unknown; numThreads?: number; proxy?: boolean } } };
}
export function configureTransformersEnvironment(
  sdk: { env: TransformersEnvironment },
  wasmUrl: string,
  cache?: boolean,
): void;
export function configureTransformersEnvironment(
  env: TransformersEnvironment,
  options: LoadBrowserModelOptions,
  baseUrl: string,
): void;
export function configureTransformersEnvironment(
  source: TransformersEnvironment | { env: TransformersEnvironment },
  config: LoadBrowserModelOptions | string,
  cacheOrBase?: boolean | string,
): void {
  const env = 'env' in source ? source.env : source;
  const options =
    typeof config === 'string'
      ? { wasmUrl: config, cache: typeof cacheOrBase === 'boolean' ? cacheOrBase : true }
      : config;
  const baseUrl = typeof cacheOrBase === 'string' ? cacheOrBase : globalThis.location.href;
  const base = new URL(baseUrl);
  const directory = new URL(options.wasmUrl, base);
  if (
    directory.origin !== base.origin ||
    !directory.pathname.endsWith('/') ||
    directory.search ||
    directory.hash
  )
    throw new Error('wasmUrl must be a same-origin directory URL ending in /.');
  env.useBrowserCache = options.cache !== false;
  env.useWasmCache = options.cache !== false;
  env.allowLocalModels = false;
  const wasm = env.backends.onnx.wasm;
  if (!wasm) throw new Error('The installed Transformers.js ONNX WASM backend is unavailable.');
  // Transformers.js 4.3.2 selects the asyncify build for both WebGPU and WASM.
  wasm.wasmPaths = {
    mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', directory).href,
    wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', directory).href,
  };
  wasm.numThreads = 1;
  wasm.proxy = false;
}
export async function loadBrowserModel(options: LoadBrowserModelOptions): Promise<{
  client: ModelClient;
  device: 'webgpu' | 'wasm';
  dispose: () => Promise<void>;
}> {
  if (options.model !== TRANSFORMERS_MODEL_ID)
    throw new Error(
      `Unsupported model: ${options.model}. Only ${TRANSFORMERS_MODEL_ID} is supported.`,
    );
  const sdk = await import('@huggingface/transformers');
  configureTransformersEnvironment(sdk.env, options, globalThis.location.href);
  const progress = (info: { status: string; file?: string; progress?: number }) =>
    options.onProgress?.(
      `${info.status}${info.file ? `: ${info.file}` : ''}${typeof info.progress === 'number' ? ` (${info.progress.toFixed(0)}%)` : ''}`,
    );
  let device: 'webgpu' | 'wasm' = 'wasm';
  try {
    const gpu = (
      globalThis.navigator as Navigator & {
        gpu?: { requestAdapter(): Promise<{ features: { has(name: string): boolean } } | null> };
      }
    ).gpu;
    if ((await gpu?.requestAdapter())?.features.has('shader-f16')) device = 'webgpu';
  } catch (error) {
    options.onProgress?.(`WebGPU unavailable: ${String(error)}`);
  }
  if (device === 'wasm' && options.allowWasmFallback === false)
    throw new Error('WebGPU with shader-f16 is required; WASM fallback is disabled.');
  const tokenizer = await sdk.AutoTokenizer.from_pretrained(TRANSFORMERS_MODEL_ID, {
    revision: TRANSFORMERS_MODEL_REVISION,
    progress_callback: progress,
  });
  const load = (target: 'webgpu' | 'wasm') =>
    sdk.Gemma4ForConditionalGeneration.from_pretrained(TRANSFORMERS_MODEL_ID, {
      revision: TRANSFORMERS_MODEL_REVISION,
      device: target,
      dtype: target === 'webgpu' ? 'q4f16' : 'q4',
      progress_callback: progress,
    });
  let model;
  try {
    model = await load(device);
  } catch (error) {
    console.error(
      `[transformers] ${device} load failed; verify matching ORT assets and available memory.`,
      error,
    );
    if (device !== 'webgpu' || options.allowWasmFallback === false) throw error;
    options.onProgress?.(`WebGPU load failed; falling back to WASM: ${String(error)}`);
    device = 'wasm';
    model = await load(device);
  }
  options.onProgress?.(`Model ready: ${device} (${device === 'webgpu' ? 'q4f16' : 'q4'})`);
  const adapter = createTransformersModelClient({
    tokenizer: tokenizer as unknown as TransformersDependencies['tokenizer'],
    model,
    createStreamer: (callback) =>
      new sdk.TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: callback,
      }),
    createStoppingCriteria: () => new sdk.InterruptableStoppingCriteria(),
    createStoppingCriteriaList: (criteria) => {
      const list = new sdk.StoppingCriteriaList();
      list.push(criteria as InstanceType<typeof sdk.InterruptableStoppingCriteria>);
      return list;
    },
  });
  return { ...adapter, device };
}
