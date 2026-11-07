import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createOpenAICompatibleModelClient } from '../../byok/openai-compatible-model-client';

const signal = () => new AbortController().signal;
function sse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
function fixture(responses: Response[]) {
  const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
  const client = createOpenAICompatibleModelClient({
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: { 'X-Title': 'MacroQuest' },
    body: { reasoning: { effort: 'low' } },
    apiKey: 'sk-or-secret',
    model: 'google/gemma-4-26b-a4b-it',
    fetch: (async (url: string, init: RequestInit) => {
      requests.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return responses.shift()!;
    }) as typeof fetch,
  });
  return { client, requests };
}

test('streams text and assembles tool calls from OpenAI-style deltas, with the key only in the header', async () => {
  const f = fixture([
    sse([
      ': OPENROUTER PROCESSING',
      'data: {"choices":[{"delta":{"content":"Sure"}}]}',
      'data: {"choices":[{"delta":{"content":"."}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"analyze_meal","arguments":"{\\"descr"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"iption\\":\\"bowl\\"}"}}]}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
      'data: [DONE]',
    ]),
  ]);
  const chunks = [];
  for await (const chunk of f.client.streamChat({
    messages: [
      { role: 'system', content: 'P' },
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'c0', type: 'function', function: { name: 'show_next_day', arguments: {} } },
        ],
      },
      { role: 'tool', tool_call_id: 'c0', content: '{"ok":true}' },
    ],
    tools: [
      {
        type: 'function',
        function: { name: 'analyze_meal', description: 'A', parameters: { type: 'object' } },
      },
    ],
    maxTokens: 64,
    abortSignal: signal(),
  }))
    chunks.push(chunk);
  assert.deepEqual(chunks, [
    { type: 'text', delta: 'Sure' },
    { type: 'text', delta: '.' },
    { type: 'tool_call', name: 'analyze_meal', arguments: { description: 'bowl' } },
  ]);
  const [request] = f.requests;
  assert.equal(request!.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request!.headers['Authorization'], 'Bearer sk-or-secret');
  assert.equal(JSON.stringify(request!.body).includes('sk-or-secret'), false);
  assert.equal(request!.body.model, 'google/gemma-4-26b-a4b-it');
  assert.equal(request!.body.stream, true);
  assert.deepEqual(request!.body.reasoning, { effort: 'low' });
  assert.equal(request!.headers['X-Title'], 'MacroQuest');
  assert.deepEqual(request!.body.messages[2], {
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: 'c0', type: 'function', function: { name: 'show_next_day', arguments: '{}' } },
    ],
  });
  assert.deepEqual(request!.body.messages[3], {
    role: 'tool',
    tool_call_id: 'c0',
    content: '{"ok":true}',
  });
});

test('JSON completion sends the schema and the image as a data URL, and retries once on invalid output', async () => {
  const f = fixture([
    Response.json({ choices: [{ message: { content: '{"title": 7}' } }] }),
    Response.json({ choices: [{ message: { content: '```json\n{"title":"Bowl"}\n```' } }] }),
  ]);
  const result = await f.client.completeJson({
    prompt: 'Estimate',
    schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    parser: z.object({ title: z.string() }),
    image: { mimeType: 'image/png', data: 'AAAA' },
    maxTokens: 100,
    abortSignal: signal(),
  });
  assert.deepEqual(result, { title: 'Bowl' });
  assert.equal(f.requests.length, 2);
  const first = f.requests[0]!.body;
  assert.equal(first.response_format.type, 'json_schema');
  assert.equal(first.response_format.json_schema.strict, true);
  assert.deepEqual(first.messages[0].content[1], {
    type: 'image_url',
    image_url: { url: 'data:image/png;base64,AAAA' },
  });
  assert.match(f.requests[1]!.body.messages.at(-1).content, /failed JSON\/schema validation/);
});

test('broken tool-call JSON is repaired before it reaches the agent', async () => {
  const chunk = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'c1',
              function: { name: 'add_meal_to_log', arguments: '{"title":"Bowl",}' },
            },
          ],
        },
      },
    ],
  };
  const f = fixture([sse([`data: ${JSON.stringify(chunk)}`, 'data: [DONE]'])]);
  const chunks = [];
  for await (const item of f.client.streamChat({
    messages: [{ role: 'user', content: 'x' }],
    tools: [],
    maxTokens: 10,
    abortSignal: signal(),
  }))
    chunks.push(item);
  assert.deepEqual(chunks, [
    { type: 'tool_call', name: 'add_meal_to_log', arguments: { title: 'Bowl' } },
  ]);
});

test('an empty turn is an error that names the finish reason', async () => {
  const f = fixture([
    sse(['data: {"choices":[{"delta":{"content":""},"finish_reason":"length"}]}', 'data: [DONE]']),
  ]);
  await assert.rejects(
    (async () => {
      for await (const chunk of f.client.streamChat({
        messages: [{ role: 'user', content: 'x' }],
        tools: [],
        maxTokens: 10,
        abortSignal: signal(),
      }))
        void chunk;
    })(),
    /empty turn \(finish reason: length\)/,
  );
});

test('API errors surface the status and message without the key', async () => {
  const f = fixture([Response.json({ error: { message: 'Invalid API key' } }, { status: 401 })]);
  await assert.rejects(
    f.client.completeJson({
      prompt: 'x',
      schema: {},
      parser: z.any(),
      maxTokens: 10,
      abortSignal: signal(),
    }),
    (error: Error) =>
      /HTTP 401: Invalid API key/.test(error.message) && !error.message.includes('sk-or-secret'),
  );
});
