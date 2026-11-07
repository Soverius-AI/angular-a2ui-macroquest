import test from 'node:test';
import assert from 'node:assert/strict';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { copilotEvents, runEvents } from '../../browser-local/agui-events';
import { macroQuestA2UIToolName } from '../../shared/macroquest-agent';

type Event = BaseEvent & Record<string, any>;
const input: RunAgentInput = {
  threadId: 'thread',
  runId: 'run',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};
async function* source(events: Event[]) {
  yield* events;
}
async function collect(events: AsyncIterable<BaseEvent>): Promise<Event[]> {
  const result: Event[] = [];
  for await (const event of events) result.push(event);
  return result;
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
const widget = {
  initialHeight: 300,
  placeholderMessages: ['Drawing fixture'],
  css: '.fixture {}',
  html: '<div>Model HTML</div>',
  jsFunctions: 'function draw() {}',
  jsExpressions: ['draw()'],
};

test('runEvents brackets translated text with exactly one successful terminal event', async () => {
  const events = await collect(
    runEvents(input, new AbortController().signal, () =>
      source([
        { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm1', delta: 'one' },
        { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm1', delta: 'two' },
        { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm2', delta: 'three' },
      ]),
    ),
  );
  assert.deepEqual(events, [
    { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' },
    { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'one' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'two' },
    { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
    { type: 'TEXT_MESSAGE_START', messageId: 'm2', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm2', delta: 'three' },
    { type: 'TEXT_MESSAGE_END', messageId: 'm2' },
    { type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' },
  ]);
});

test('runEvents converts generation failures to RUN_ERROR, never RUN_FINISHED', async () => {
  const events = await collect(
    runEvents(input, new AbortController().signal, async function* () {
      throw new Error('fixture failure');
    }),
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ['RUN_STARTED', 'RUN_ERROR'],
  );
  assert.equal(events.at(-1)?.message, 'fixture failure');
});

for (const timing of ['before', 'during', 'empty completion'] as const) {
  test(`cancellation ${timing} produces a single RUN_ERROR terminal`, async () => {
    const controller = new AbortController();
    if (timing === 'before') controller.abort();
    let cleanedUp = false;
    const events = await collect(
      runEvents(input, controller.signal, async function* () {
        try {
          if (timing !== 'before') controller.abort();
          if (timing !== 'empty completion')
            yield { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', delta: 'discarded' } as BaseEvent;
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

test('A2UI render calls become catalog-backed surface operations without frontend tool calls', async () => {
  const surface = {
    surfaceId: 'model-surface',
    components: [{ id: 'root', component: 'Text', text: 'Model text' }],
    data: { model: true },
  };
  assert.deepEqual(await collect(copilotEvents(source(calls(macroQuestA2UIToolName, surface)))), [
    {
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'a2ui-surface-call',
      activityType: 'a2ui-surface',
      replace: true,
      content: {
        a2ui_operations: [
          {
            version: 'v0.9',
            createSurface: {
              surfaceId: surface.surfaceId,
              catalogId: 'https://a2ui.org/specification/v0_9/basic_catalog.json',
            },
          },
          {
            version: 'v0.9',
            updateComponents: { surfaceId: surface.surfaceId, components: surface.components },
          },
          {
            version: 'v0.9',
            updateDataModel: { surfaceId: surface.surfaceId, path: '/', value: surface.data },
          },
        ],
      },
    },
  ]);
});

test('Open Generative UI preserves model HTML after a restrictive CSP head and marks all generation flags complete', async () => {
  const events = await collect(copilotEvents(source(calls('generateSandboxedUi', widget))));
  assert.equal(events.length, 1);
  const html = events[0].content.html;
  assert.ok(Array.isArray(html));
  assert.equal(html.length, 1);
  assert.equal(typeof html[0], 'string');
  assert.ok(html[0].startsWith('<head><meta http-equiv="Content-Security-Policy" content="'));
  assert.ok(
    html[0].endsWith(`</head>${widget.html}`),
    'the original model-authored content must remain unchanged',
  );
  const policy = html[0].slice(0, html[0].indexOf('</head>'));
  for (const directive of [
    "default-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data:',
  ]) {
    assert.ok(policy.includes(directive), `expected sandbox policy directive: ${directive}`);
  }
  assert.deepEqual(events, [
    {
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'call-activity',
      activityType: 'open-generative-ui',
      replace: true,
      content: {
        ...widget,
        html,
        cssComplete: true,
        htmlComplete: true,
        jsFunctionsComplete: true,
        jsExpressionsComplete: true,
        generating: false,
      },
    },
  ]);
});

for (const invalid of [
  { ...widget, html: '' },
  { ...widget, initialHeight: 99 },
  { ...widget, initialHeight: 2001 },
  { ...widget, jsExpressions: 'draw()' },
]) {
  test(`invalid sandbox rejects: ${JSON.stringify(invalid)}`, async () => {
    await assert.rejects(collect(copilotEvents(source(calls('generateSandboxedUi', invalid)))));
    const events = await collect(
      runEvents(input, new AbortController().signal, () =>
        source(calls('generateSandboxedUi', invalid)),
      ),
    );
    assert.deepEqual(
      events.map((event) => event.type),
      ['RUN_STARTED', 'RUN_ERROR'],
    );
  });
}

test('original frontend tools survive translation unchanged alongside internally handled render calls', async () => {
  const frontend = [
    ...calls('setMacroGoals', { protein: 120 }, 'goals'),
    ...calls('logMealDraft', { title: 'Meal' }, 'meal'),
  ];
  const translated = await collect(
    copilotEvents(source([...frontend, ...calls('generateSandboxedUi', widget)])),
  );
  assert.deepEqual(translated.slice(0, frontend.length), frontend);
  assert.equal(translated.length, frontend.length + 1);
  assert.equal(translated.at(-1)?.type, 'ACTIVITY_SNAPSHOT');
});
