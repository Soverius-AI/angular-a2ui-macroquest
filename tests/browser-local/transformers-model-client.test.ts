import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  configureTransformersEnvironment,
  createTransformersModelClient,
  loadBrowserModel,
  TRANSFORMERS_MODEL_ID,
  type TransformersDependencies,
} from '../../browser-local/transformers-model-client';

const signal = () => new AbortController().signal;
const format = {
  type: 'json_schema',
  json_schema: {
    name: 'result',
    schema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    },
  },
};
async function collect(stream: AsyncIterable<string>) {
  let text = '';
  for await (const s of stream) text += s;
  return text;
}
function fixture(responses = ['hello', ' world']) {
  const templates: { messages: unknown; options: Record<string, unknown> }[] = [];
  const generations: Record<string, unknown>[] = [];
  let calls = 0;
  let outputDisposed = 0;
  let inputDisposed = 0;
  let modelDisposed = 0;
  let reset = 0;
  let interrupted = 0;
  let generate: TransformersDependencies['model']['generate'] = async (options) => {
    (options['streamer'] as (text: string) => void)(responses[calls++] ?? '');
    return {
      dispose() {
        outputDisposed++;
      },
    };
  };
  const adapter = createTransformersModelClient({
    tokenizer: {
      apply_chat_template(messages, options) {
        templates.push({ messages: structuredClone(messages), options });
        return {
          input_ids: {
            dims: [1, 20],
            dispose() {
              inputDisposed++;
            },
          },
        };
      },
    },
    model: {
      async generate(options) {
        generations.push(options);
        return generate(options);
      },
      async dispose() {
        modelDisposed++;
      },
    },
    createStreamer: (callback) => callback,
    createStoppingCriteria: () => ({
      interrupt() {
        interrupted++;
      },
      reset() {
        reset++;
      },
    }),
    createStoppingCriteriaList: (criteria) => [criteria],
  });
  return {
    ...adapter,
    templates,
    generations,
    setGenerate(fn: typeof generate) {
      generate = fn;
    },
    stats: () => ({ outputDisposed, inputDisposed, modelDisposed, reset, interrupted }),
  };
}
const chat = () => ({
  messages: [{ role: 'user' as const, content: 'Hi' }],
  maxTokens: 64,
  temperature: 0.8,
  abortSignal: signal(),
});

test('plain streaming is greedy, thinking disabled, with fresh criteria and tensor cleanup', async () => {
  const f = fixture();
  assert.equal(await collect(f.client.streamChat(chat())), 'hello');
  assert.equal(await collect(f.client.streamChat(chat())), ' world');
  assert.equal(f.templates[0]!.options['enable_thinking'], false);
  assert.equal(f.templates[0]!.options['add_generation_prompt'], true);
  assert.equal(f.generations[0]!['do_sample'], false);
  assert.equal(f.generations[0]!['max_new_tokens'], 64);
  assert.notEqual(f.generations[0]!['stopping_criteria'], f.generations[1]!['stopping_criteria']);
  assert.equal(f.stats().outputDisposed, 2);
  assert.equal(f.stats().inputDisposed, 2);
  await f.dispose();
});

test('JSON includes original schema, validates strict/fenced JSON and retries once with feedback', async () => {
  const f = fixture(['{"answer":42}', '```json\n{"answer":"ok"}\n```']);
  const result = await f.client.completeJson({
    prompt: 'answer',
    responseFormat: format,
    parser: z.object({ answer: z.string() }).strict(),
    maxTokens: 100,
    temperature: 1,
    abortSignal: signal(),
  });
  assert.deepEqual(result, { answer: 'ok' });
  assert.match(JSON.stringify(f.templates[0]!.messages), /additionalProperties/);
  assert.match(JSON.stringify(f.templates[1]!.messages), /failed JSON\/schema validation/);
  assert.equal(f.generations.length, 2);
  await f.dispose();
});

test('invalid JSON is rejected after only one retry; images and oversized output rejected', async () => {
  const f = fixture(['bad', 'still bad']);
  const input = {
    prompt: 'answer',
    responseFormat: format,
    parser: z.string(),
    maxTokens: 100,
    temperature: 0,
    abortSignal: signal(),
  };
  await assert.rejects(f.client.completeJson(input), /after one feedback retry/);
  assert.equal(f.generations.length, 2);
  await assert.rejects(
    f.client.completeJson({ ...input, imageUrl: 'data:image/png;base64,AA==' }),
    /text-only/,
  );
  await assert.rejects(
    collect(f.client.streamChat({ ...chat(), maxTokens: 3001 })),
    /never silently truncated/,
  );
  await f.dispose();
});

test('abort interrupts and disposal waits for in-flight generation; overlapping calls rejected', async () => {
  const f = fixture();
  let finish!: () => void;
  f.setGenerate(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return undefined;
  });
  const controller = new AbortController();
  const running = collect(f.client.streamChat({ ...chat(), abortSignal: controller.signal }));
  const rejected = assert.rejects(running, /cancelled|disposed|abort/i);
  await assert.rejects(collect(f.client.streamChat(chat())), /Concurrent/);
  controller.abort();
  const disposal = f.dispose();
  await Promise.resolve();
  assert.equal(f.stats().modelDisposed, 0);
  assert.ok(f.stats().interrupted > 0);
  finish();
  await rejected;
  await disposal;
  await f.dispose();
  assert.equal(f.stats().modelDisposed, 1);
  await assert.rejects(collect(f.client.streamChat(chat())), /disposed/);
});

test('pre-aborted requests do not generate and release lock', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    collect(f.client.streamChat({ ...chat(), abortSignal: controller.signal })),
    /abort/i,
  );
  assert.equal(f.generations.length, 0);
  assert.equal(await collect(f.client.streamChat(chat())), 'hello');
  await f.dispose();
});

test('no-cache uses actual SDK flags and explicit same-origin asyncify ORT URLs', () => {
  const env = {
    useBrowserCache: true,
    useWasmCache: true,
    allowLocalModels: true,
    backends: { onnx: { wasm: { wasmPaths: undefined as unknown, numThreads: 8, proxy: true } } },
  };
  const options = { model: TRANSFORMERS_MODEL_ID, wasmUrl: '/ort/', cache: false };
  configureTransformersEnvironment(env, options, 'http://localhost:4303/worker.js');
  assert.equal(env.useBrowserCache, false);
  assert.equal(env.useWasmCache, false);
  assert.equal(env.allowLocalModels, false);
  assert.equal(env.backends.onnx.wasm.numThreads, 1);
  assert.equal(env.backends.onnx.wasm.proxy, false);
  assert.deepEqual(env.backends.onnx.wasm.wasmPaths, {
    mjs: 'http://localhost:4303/ort/ort-wasm-simd-threaded.asyncify.mjs',
    wasm: 'http://localhost:4303/ort/ort-wasm-simd-threaded.asyncify.wasm',
  });
  assert.throws(
    () =>
      configureTransformersEnvironment(
        env,
        { ...options, wasmUrl: 'https://cdn.example/ort/' },
        'http://localhost/',
      ),
    /same-origin/,
  );
  assert.throws(
    () =>
      configureTransformersEnvironment(
        env,
        { ...options, wasmUrl: '/ort/file.wasm' },
        'http://localhost/',
      ),
    /directory/,
  );
});

test('sandbox payload is buffered, validated and canonically ordered before execution', async () => {
  const widget = {
    html: '<p>Model output</p>',
    css: '',
    initialHeight: 300,
    jsExpressions: ['render()'],
    jsFunctions: 'function render() {}',
    placeholderMessages: ['Loading'],
  };
  const f = fixture([JSON.stringify(widget)]);
  const stream = f.client.streamJson({
    prompt: 'widget',
    responseFormat: format,
    maxTokens: 100,
    temperature: 0,
    abortSignal: signal(),
  });
  const first = await stream.next();
  assert.equal(
    first.value,
    JSON.stringify({
      initialHeight: widget.initialHeight,
      placeholderMessages: widget.placeholderMessages,
      css: widget.css,
      html: widget.html,
      jsFunctions: widget.jsFunctions,
      jsExpressions: widget.jsExpressions,
    }),
  );
  assert.equal((await stream.next()).done, true);
  await f.dispose();
  const invalid = fixture(['{}', '{}']);
  await assert.rejects(
    invalid.client
      .streamJson({
        prompt: 'widget',
        responseFormat: format,
        maxTokens: 100,
        temperature: 0,
        abortSignal: signal(),
      })
      .next(),
    /after one feedback retry/,
  );
  await invalid.dispose();
});

test('unsupported model rejected before SDK import or any fetch', async () => {
  await assert.rejects(loadBrowserModel({ model: 'other', wasmUrl: '/ort/' }), /Unsupported model/);
});
