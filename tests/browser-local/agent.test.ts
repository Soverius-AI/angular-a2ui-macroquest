import test from 'node:test';
import assert from 'node:assert/strict';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import {
  createMacroQuestAgent,
  macroQuestA2UIToolName,
  type ModelClient,
} from '../../shared/macroquest-agent';

function input(threadId = 'thread-a', extra: Partial<RunAgentInput> = {}): RunAgentInput {
  return {
    threadId,
    runId: 'run',
    messages: [{ id: 'user', role: 'user', content: 'fixture request' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    ...extra,
  };
}
async function collect(source: AsyncIterable<BaseEvent>) {
  const events: (BaseEvent & Record<string, any>)[] = [];
  for await (const event of source) events.push(event);
  return events;
}
function model(responses: unknown[], deltas: string[] = []) {
  const calls: Parameters<ModelClient['completeJson']>[0][] = [];
  const chats: Parameters<ModelClient['streamChat']>[0][] = [];
  const client: ModelClient = {
    async completeJson(options) {
      calls.push(options);
      assert.ok(responses.length, 'unexpected model generation');
      return options.parser.parse(responses.shift());
    },
    async *streamChat(options) {
      chats.push(options);
      yield* deltas;
    },
    async *streamJson() {
      assert.fail('unexpected streamed JSON generation');
    },
  };
  return { client, calls, chats };
}
function tool(events: Awaited<ReturnType<typeof collect>>, name: string) {
  const start = events.find(
    (event) => event.type === 'TOOL_CALL_START' && event.toolCallName === name,
  );
  assert.ok(start, `expected ${name}`);
  assert.ok(
    events.some((event) => event.type === 'TOOL_CALL_END' && event.toolCallId === start.toolCallId),
  );
  return JSON.parse(
    events
      .filter((event) => event.type === 'TOOL_CALL_ARGS' && event.toolCallId === start.toolCallId)
      .map((event) => event.delta)
      .join(''),
  );
}
function meal(name = 'Model lentils') {
  return {
    mealDraft: {
      title: name,
      source: 'Fixture model',
      notes: 'Model-authored estimate',
      items: [
        {
          name,
          servingLabel: 'bowl',
          servings: 1,
          calories: 300,
          protein: 20,
          carbs: 40,
          fat: 7,
          confidence: 0.8,
        },
      ],
    },
    a2ui: {
      surfaceId: 'same-surface',
      components: [
        { id: 'root', component: 'Column', children: ['totals', 'apply'] },
        { id: 'totals', component: 'Text', text: `${name}: 300 kcal, 20 protein, 40 carbs, 7 fat` },
        {
          id: 'apply',
          component: 'Button',
          child: 'label',
          action: { event: { name: 'applyMealDraft', context: { modelMarker: name } } },
        },
        { id: 'label', component: 'Text', text: 'Log model meal' },
      ],
      data: { modelMarker: name },
    },
  };
}
function apply(threadId: string, timestamp = 'one') {
  return input(threadId, {
    forwardedProps: {
      a2uiAction: {
        userAction: {
          name: 'applyMealDraft',
          surfaceId: 'same-surface',
          sourceComponentId: 'apply',
          timestamp,
        },
      },
    },
  });
}
const signal = () => new AbortController().signal;

test('injected chat client receives context, history, abort signal and bounded options', async () => {
  const fixture = model([{ intent: 'chat' }], ['Hello ', 'from fixture']);
  const agent = createMacroQuestAgent(fixture.client, { maxOutputTokens: 123 });
  const abortSignal = signal();
  const events = await collect(
    agent(
      input('chat', { context: [{ description: 'daily goals', value: 'protein 120g' }] }),
      abortSignal,
    ),
  );
  assert.equal(events.map((event) => event.delta).join(''), 'Hello from fixture');
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].abortSignal, abortSignal);
  assert.equal(fixture.chats.length, 1);
  assert.equal(fixture.chats[0].maxTokens, 123);
  assert.equal(fixture.chats[0].abortSignal, abortSignal);
  assert.match(fixture.chats[0].messages[0].content, /protein 120g/);
  assert.deepEqual(fixture.chats[0].messages.at(-1), { role: 'user', content: 'fixture request' });
});

test('goals are extracted, normalized and emitted as the frontend setMacroGoals tool', async () => {
  const fixture = model([
    { intent: 'set_goals' },
    { calories: 2100.4, protein: 125.7, carbs: 0, fat: -1 },
  ]);
  const events = await collect(createMacroQuestAgent(fixture.client)(input(), signal()));
  assert.deepEqual(tool(events, 'setMacroGoals'), { calories: 2100, protein: 126 });
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.chats.length, 0);
});

test('model-authored meal surface is preserved, then apply logs the matching draft exactly once', async () => {
  const response = meal();
  const fixture = model([{ intent: 'analyze_meal' }, response]);
  const agent = createMacroQuestAgent(fixture.client);
  assert.deepEqual(
    tool(await collect(agent(input(), signal())), macroQuestA2UIToolName),
    response.a2ui,
  );
  const applied = await collect(agent(apply('thread-a'), signal()));
  assert.deepEqual(tool(applied, 'logMealDraft'), {
    ...response.mealDraft,
    items: [{ ...response.mealDraft.items[0], id: 'gemma-1' }],
  });
  assert.deepEqual(await collect(agent(apply('thread-a'), signal())), []);
  const missing = await collect(agent(apply('thread-a', 'new-click'), signal()));
  assert.ok(missing.some((event) => event.type === 'TEXT_MESSAGE_CHUNK'));
  assert.ok(!missing.some((event) => event.type === 'TOOL_CALL_START'));
  assert.equal(fixture.calls.length, 2);
});

for (const name of ['logMealDraft', 'setMacroGoals', macroQuestA2UIToolName, 'unknown']) {
  test(`tool-result continuation for ${name} never regenerates`, async () => {
    const fixture = model([]);
    const agent = createMacroQuestAgent(fixture.client);
    const events = await collect(
      agent(
        input('continuation', {
          messages: [
            {
              id: 'assistant',
              role: 'assistant',
              toolCalls: [{ id: 'call', type: 'function', function: { name, arguments: '{}' } }],
            },
            { id: 'result', role: 'tool', toolCallId: 'call', content: '{}' },
          ],
        }),
        signal(),
      ),
    );
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.chats.length, 0);
    assert.ok(events.every((event) => event.type === 'TEXT_MESSAGE_CHUNK'));
    assert.equal(events.length > 0, name === 'logMealDraft');
  });
}

test('pending drafts and action deduplication are isolated by thread even for identical surface IDs', async () => {
  const fixture = model([
    { intent: 'analyze_meal' },
    meal('Meal A'),
    { intent: 'analyze_meal' },
    meal('Meal B'),
  ]);
  const agent = createMacroQuestAgent(fixture.client);
  await collect(agent(input('a'), signal()));
  const otherThread = await collect(agent(apply('b'), signal()));
  assert.ok(!otherThread.some((event) => event.type === 'TOOL_CALL_START'));
  await collect(agent(input('b'), signal()));
  assert.equal(tool(await collect(agent(apply('a'), signal())), 'logMealDraft').title, 'Meal A');
  assert.equal(tool(await collect(agent(apply('b'), signal())), 'logMealDraft').title, 'Meal B');
  assert.equal(fixture.calls.length, 4);
});
