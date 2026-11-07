import assert from 'node:assert/strict';
import test from 'node:test';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { withGenerativeUI } from '../../byok/generative-ui';
import type { AgentRun } from '../../byok/agent';
import { runEvents } from '../../byok/agui-events';

type Event = BaseEvent & Record<string, any>;
const input: RunAgentInput = {
  threadId: 'thread',
  runId: 'run',
  messages: [{ id: 'u', role: 'user', content: 'show a card' }],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};
const started: Event = { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' };
const finished: Event = { type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' };
async function collect(events: AsyncIterable<BaseEvent>): Promise<Event[]> {
  const result: Event[] = [];
  for await (const event of events) result.push(event);
  return result;
}
function run(events: Event[]): AgentRun {
  return async function* () {
    yield* events;
  };
}
function calls(name: string, args: unknown, id = 'call'): Event[] {
  const json = JSON.stringify(args);
  return [
    { type: 'TOOL_CALL_START', toolCallId: id, toolCallName: name, parentMessageId: 'message' },
    { type: 'TOOL_CALL_ARGS', toolCallId: id, delta: json.slice(0, 7) },
    { type: 'TOOL_CALL_ARGS', toolCallId: id, delta: json.slice(7) },
    { type: 'TOOL_CALL_END', toolCallId: id },
  ];
}

test('runEvents passes a complete run through untouched', async () => {
  const events = [
    started,
    { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' },
    finished,
  ];
  assert.deepEqual(
    await collect(runEvents(input, new AbortController().signal, run(events))),
    events,
  );
});

test('runEvents converts failures to RUN_ERROR, never RUN_FINISHED, and always opens the run', async () => {
  const early = await collect(
    runEvents(input, new AbortController().signal, async function* () {
      throw new Error('fixture failure');
    }),
  );
  assert.deepEqual(early, [started, { type: 'RUN_ERROR', message: 'fixture failure' }]);
  const late = await collect(
    runEvents(input, new AbortController().signal, async function* () {
      yield started;
      throw new Error('late failure');
    }),
  );
  assert.deepEqual(late, [started, { type: 'RUN_ERROR', message: 'late failure' }]);
  const unfinished = await collect(runEvents(input, new AbortController().signal, run([started])));
  assert.equal(unfinished.at(-1)?.type, 'RUN_ERROR');
  assert.match(unfinished.at(-1)?.message, /without finishing/);
});

for (const timing of ['before', 'during', 'empty completion'] as const) {
  test(`cancellation ${timing} produces a single RUN_ERROR terminal`, async () => {
    const controller = new AbortController();
    if (timing === 'before') controller.abort();
    let cleanedUp = false;
    const events = await collect(
      runEvents(input, controller.signal, async function* () {
        try {
          yield started;
          if (timing !== 'before') controller.abort();
          if (timing !== 'empty completion')
            yield { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', delta: 'discarded' } as BaseEvent;
          yield finished;
        } finally {
          cleanedUp = true;
        }
      }),
    );
    assert.deepEqual(
      events.map((event) => event.type),
      ['RUN_STARTED', 'RUN_ERROR'],
    );
    assert.equal(events.at(-1)?.message, 'Local generation cancelled.');
    assert.ok(cleanedUp);
  });
}

test('A2UI: render tool injected when the client has a catalog; render calls become surfaces', async () => {
  const seen: RunAgentInput[] = [];
  const surface = {
    surfaceId: 'model-surface',
    components: [{ id: 'root', component: 'Text', text: 'Model text' }],
    data: { model: true },
  };
  const agent = withGenerativeUI(async function* (received) {
    seen.push(received);
    yield* [started, ...calls('render_a2ui', surface), finished];
  });
  const schema = {
    description:
      'A2UI Component Schema — available components for generating UI surfaces. Use these component names and properties when creating A2UI operations.',
    value: JSON.stringify({ catalogId: 'app-catalog', components: {} }),
  };
  const events = await collect(
    agent(
      {
        ...input,
        context: [schema, { description: 'A2UI design guidelines', value: 'keep' }],
        forwardedProps: { a2uiCatalogAvailable: true },
      },
      new AbortController().signal,
    ),
  );
  assert.ok(seen[0]!.tools.some((tool) => tool.name === 'render_a2ui'));
  assert.ok(
    seen[0]!.context.some((entry) => entry.description.startsWith('A2UI render tool usage guide')),
  );
  assert.ok(seen[0]!.context.some((entry) => entry.description === 'A2UI design guidelines'));
  assert.ok(seen[0]!.context.some((entry) => entry.description === schema.description));
  const painted = events.filter(
    (event) =>
      event.type === 'ACTIVITY_SNAPSHOT' &&
      event.activityType === 'a2ui-surface' &&
      event.content.a2ui_operations,
  );
  assert.ok(painted.length >= 1);
  const operations = painted.at(-1)!.content.a2ui_operations;
  assert.deepEqual(operations[0].createSurface, {
    surfaceId: 'model-surface',
    catalogId: 'app-catalog',
  });
  assert.deepEqual(operations[1].updateComponents.components, surface.components);
  assert.deepEqual(operations[2].updateDataModel.value, surface.data);
  const result = events.find((event) => event.type === 'TOOL_CALL_RESULT');
  assert.equal(result?.toolCallId, 'call');
  assert.equal(JSON.parse(result?.content).status, 'rendered');
  assert.equal(events.at(-1)?.type, 'RUN_FINISHED');
  assert.ok(events.indexOf(result!) < events.indexOf(events.at(-1)!));
});

test('Open Generative UI: sandbox tool calls become open-generative-ui activities', async () => {
  const widget = {
    initialHeight: 300,
    placeholderMessages: ['Drawing'],
    css: '.chart {}',
    html: '<div class="chart">Model HTML</div>',
    jsFunctions: 'function draw() {}',
    jsExpressions: ['draw()'],
  };
  const agent = withGenerativeUI(async function* () {
    yield* [started, ...calls('generateSandboxedUi', widget, 'sandbox'), finished];
  });
  const events = await collect(agent(input, new AbortController().signal));
  const snapshot = events.find(
    (event) => event.type === 'ACTIVITY_SNAPSHOT' && event.activityType === 'open-generative-ui',
  );
  assert.deepEqual(snapshot?.content, { initialHeight: 300, generating: true });
  const patches = events
    .filter((event) => event.type === 'ACTIVITY_DELTA' && event.messageId === snapshot?.messageId)
    .flatMap((event) => event.patch as { path: string; value: unknown }[]);
  assert.ok(patches.some((patch) => patch.path === '/html/-' && patch.value === widget.html));
  assert.deepEqual(patches.at(-1), { op: 'add', path: '/generating', value: false });
  assert.equal(events.at(-1)?.type, 'RUN_FINISHED');
});

test('A2UI: without a client catalog no render tool is injected and events pass through', async () => {
  const seen: RunAgentInput[] = [];
  const frontend = [started, ...calls('show_previous_day', {}), finished];
  const agent = withGenerativeUI(async function* (received) {
    seen.push(received);
    yield* frontend;
  });
  const events = await collect(agent(input, new AbortController().signal));
  assert.deepEqual(seen[0]!.tools, []);
  assert.deepEqual(events, frontend);
});

test('A2UI: agent failures propagate through the middleware into RUN_ERROR', async () => {
  const agent = withGenerativeUI(async function* () {
    yield started;
    throw new Error('model failed');
  });
  const events = await collect(runEvents(input, new AbortController().signal, agent));
  assert.deepEqual(
    events.map((event) => event.type),
    ['RUN_STARTED', 'RUN_ERROR'],
  );
  assert.equal(events.at(-1)?.message, 'model failed');
});

test('the A2UI guard validates against the client catalog schema', async () => {
  const { a2uiGuard } = await import('../../byok/generative-ui');
  const schema = {
    description:
      'A2UI Component Schema — available components for generating UI surfaces. Use these component names and properties when creating A2UI operations.',
    value: JSON.stringify({
      catalogId: 'copilotkit://angular-catalog',
      components: { Text: {}, Column: {} },
    }),
  };
  const withCatalog = { ...input, context: [schema] };
  const nested = a2uiGuard.validate(
    { components: [{ component: 'Column', children: [{ component: 'Metric', label: 'x' }] }] },
    withCatalog,
  );
  assert.match(nested!, /missing_surface_id/);
  assert.match(nested!, /nested_children/);
  assert.match(nested!, /missing_id/);
  assert.match(nested!, /no_root/);
  const unknown = a2uiGuard.validate(
    { surfaceId: 's', components: [{ id: 'root', component: 'Metric', label: 'x' }] },
    withCatalog,
  );
  assert.match(unknown!, /unknown_component.*Metric/);
  const valid = a2uiGuard.validate(
    {
      surfaceId: 's',
      components: [
        { id: 'root', component: 'Column', children: ['t'] },
        { id: 't', component: 'Text', text: 'hi' },
      ],
    },
    withCatalog,
  );
  assert.equal(valid, undefined);
  assert.deepEqual(a2uiGuard.exhausted(['e1', 'e2']), {
    code: 'a2ui_recovery_exhausted',
    error: 'e2',
    attempts: ['e1', 'e2'],
  });
});
