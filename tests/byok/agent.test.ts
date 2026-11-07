import assert from 'node:assert/strict';
import test from 'node:test';
import type { BaseEvent, Message, RunAgentInput } from '@ag-ui/core';
import { createBrowserAgent, toChatMessages, type LocalTool } from '../../byok/agent';
import type { ChatChunk, ModelClient } from '../../byok/model-client';

type Event = BaseEvent & Record<string, any>;
function input(extra: Partial<RunAgentInput> = {}): RunAgentInput {
  return {
    threadId: 'thread',
    runId: 'run',
    messages: [{ id: 'u1', role: 'user', content: 'fixture request' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    ...extra,
  };
}
function model(turns: ChatChunk[][]) {
  const calls: Parameters<ModelClient['streamChat']>[0][] = [];
  const client: ModelClient = {
    async *streamChat(options) {
      calls.push({ ...options, messages: options.messages.map((message) => ({ ...message })) });
      const turn = turns.shift();
      assert.ok(turn, 'unexpected model call');
      yield* turn;
    },
    async completeJson() {
      assert.fail('unexpected JSON completion');
    },
  };
  return { client, calls };
}
async function collect(source: AsyncIterable<BaseEvent>): Promise<Event[]> {
  const events: Event[] = [];
  for await (const event of source) events.push(event);
  return events;
}
const echo: LocalTool = {
  definition: {
    type: 'function',
    function: {
      name: 'echo',
      description: 'Echo',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
    },
  },
  async *execute(args) {
    yield {
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'echo',
      activityType: 'echo',
      content: args,
    } as BaseEvent;
    return { echoed: args['text'] };
  },
};
const boom: LocalTool = {
  definition: {
    type: 'function',
    function: { name: 'boom', description: 'Fails', parameters: { type: 'object' } },
  },
  // eslint-disable-next-line require-yield
  async *execute() {
    throw new Error('tool exploded');
  },
};
const agent = (client: ModelClient) =>
  createBrowserAgent(client, {
    prompt: 'PROMPT',
    maxSteps: 2,
    maxOutputTokens: 50,
    tools: [echo, boom],
  });
const signal = () => new AbortController().signal;

test('plain answer: one model call bracketed by run and text events', async () => {
  const fixture = model([
    [
      { type: 'text', delta: 'Hi ' },
      { type: 'text', delta: 'there' },
    ],
  ]);
  const events = await collect(agent(fixture.client)(input(), signal()));
  assert.deepEqual(
    events.map((event) => event.type),
    [
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ],
  );
  assert.equal(
    events
      .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
      .map((event) => event.delta)
      .join(''),
    'Hi there',
  );
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0]!.maxTokens, 50);
  assert.deepEqual(
    fixture.calls[0]!.tools.map((tool) => tool.function.name),
    ['echo', 'boom'],
  );
  assert.equal(fixture.calls[0]!.messages[0]!.role, 'system');
  assert.match(fixture.calls[0]!.messages[0]!.content, /^PROMPT/);
  assert.deepEqual(fixture.calls[0]!.messages.at(-1), { role: 'user', content: 'fixture request' });
});

test('system prompt carries application context and non-empty state like BuiltInAgent', () => {
  const [system] = toChatMessages(
    input({ context: [{ description: 'Goals', value: 'protein 120' }], state: { a: 1 } }),
    'PROMPT',
  );
  assert.match(system!.content, /^PROMPT\n## Context from the application\nGoals:\nprotein 120\n/);
  assert.match(system!.content, /## Application State[\s\S]*"a": 1/);
  assert.doesNotMatch(toChatMessages(input(), 'PROMPT')[0]!.content, /Application State/);
});

test('history conversion: tool calls parsed, tool results forwarded, attachments noted, other roles dropped', () => {
  const messages = toChatMessages(
    input({
      messages: [
        { id: 's', role: 'system', content: 'dropped' },
        {
          id: 'u',
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'binary', mimeType: 'image/png', data: 'AA==' },
          ],
        },
        {
          id: 'a',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'analyze_meal', arguments: '{"description":"bowl"}' },
            },
          ],
        },
        { id: 't', role: 'tool', toolCallId: 'c1', content: '{"ok":true}' },
        { id: 'act', role: 'activity', activityType: 'x', content: {} },
      ] as unknown as Message[],
    }),
    'PROMPT',
  );
  assert.deepEqual(messages.slice(1), [
    {
      role: 'user',
      content:
        'look\n(The user attached 1 file(s). Call analyze_meal to analyze an attached meal photo.)',
    },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'analyze_meal', arguments: { description: 'bowl' } },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' },
  ]);
});

test('local tool runs inside the run; its events and result feed the next step; the step cap holds', async () => {
  const fixture = model([
    [{ type: 'tool_call', name: 'echo', arguments: { text: 'a' } }],
    [{ type: 'tool_call', name: 'echo', arguments: { text: 'b' } }],
  ]);
  const events = await collect(agent(fixture.client)(input(), signal()));
  const start = events.find((event) => event.type === 'TOOL_CALL_START');
  assert.equal(start?.toolCallName, 'echo');
  assert.deepEqual(
    events.filter((event) => event.toolCallId === start?.toolCallId).map((event) => event.type),
    ['TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'TOOL_CALL_RESULT'],
  );
  assert.equal(events.find((event) => event.type === 'TOOL_CALL_ARGS')?.delta, '{"text":"a"}');
  assert.deepEqual(events.find((event) => event.type === 'ACTIVITY_SNAPSHOT')?.content, {
    text: 'a',
  });
  assert.equal(
    events.find((event) => event.type === 'TOOL_CALL_RESULT')?.content,
    '{"echoed":"a"}',
  );
  assert.equal(events.filter((event) => event.type === 'TOOL_CALL_RESULT').length, 2);
  assert.equal(events.at(-1)?.type, 'RUN_FINISHED');
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(fixture.calls[1]!.messages.slice(-2), [
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: start!.toolCallId,
          type: 'function',
          function: { name: 'echo', arguments: { text: 'a' } },
        },
      ],
    },
    { role: 'tool', tool_call_id: start!.toolCallId, content: '{"echoed":"a"}' },
  ]);
});

test('a frontend tool call ends the run without a result or another model call', async () => {
  const fixture = model([
    [
      { type: 'text', delta: 'Logging' },
      { type: 'tool_call', name: 'add_meal_to_log', arguments: { title: 'x' } },
    ],
  ]);
  const events = await collect(
    agent(fixture.client)(
      input({
        tools: [{ name: 'add_meal_to_log', description: 'Add', parameters: { type: 'object' } }],
      }),
      signal(),
    ),
  );
  assert.deepEqual(
    events.map((event) => event.type),
    [
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'RUN_FINISHED',
    ],
  );
  assert.equal(events[4]!.parentMessageId, events[1]!.messageId);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(
    fixture.calls[0]!.tools.map((tool) => tool.function.name),
    ['add_meal_to_log', 'echo', 'boom'],
  );
});

test('a failing local tool yields an error result the model can answer', async () => {
  const fixture = model([
    [{ type: 'tool_call', name: 'boom', arguments: {} }],
    [{ type: 'text', delta: 'Sorry' }],
  ]);
  const events = await collect(agent(fixture.client)(input(), signal()));
  assert.equal(
    events.find((event) => event.type === 'TOOL_CALL_RESULT')?.content,
    '{"error":"tool exploded"}',
  );
  assert.equal(events.find((event) => event.type === 'TEXT_MESSAGE_CONTENT')?.delta, 'Sorry');
  assert.equal(events.at(-1)?.type, 'RUN_FINISHED');
});

test('an unreadable tool call gets one correction turn, then the run fails with the reason', async () => {
  const fixture = model([
    [
      {
        type: 'tool_call_error',
        name: 'echo',
        raw: 'call:echo{text:',
        error: 'Unterminated string',
      },
    ],
    [{ type: 'tool_call', name: 'echo', arguments: { text: 'fixed' } }],
    [{ type: 'text', delta: 'Done' }],
  ]);
  const events = await collect(agent(fixture.client)(input(), signal()));
  assert.equal(
    events.find((event) => event.type === 'TOOL_CALL_RESULT')?.content,
    '{"echoed":"fixed"}',
  );
  assert.equal(fixture.calls.length, 3, 'correction turn, tool turn, answer');
  assert.deepEqual(fixture.calls[1]!.messages.slice(-2), [
    { role: 'assistant', content: '[unreadable tool call] call:echo{text:' },
    {
      role: 'user',
      content:
        'Your call to echo could not be read (Unterminated string). Call it again with complete, well-formed arguments.',
    },
  ]);
  const hopeless = model([
    [{ type: 'tool_call_error', name: 'echo', raw: 'x', error: 'bad' }],
    [{ type: 'tool_call_error', name: 'echo', raw: 'x', error: 'bad again' }],
  ]);
  await assert.rejects(
    collect(agent(hopeless.client)(input(), signal())),
    /could not be read twice: bad again/,
  );
});

test('a known A2UI user action becomes the frontend tool call directly, with no model turn', async () => {
  const fixture = model([]);
  const run = createBrowserAgent(fixture.client, {
    prompt: 'P',
    maxSteps: 2,
    maxOutputTokens: 50,
    tools: [],
    userActions: {
      add_meal: (context) =>
        typeof context['title'] === 'string'
          ? { tool: 'add_meal_to_log', args: { title: context['title'] } }
          : undefined,
    },
  });
  const events = await collect(
    run(
      input({
        tools: [{ name: 'add_meal_to_log', description: 'Add', parameters: { type: 'object' } }],
        forwardedProps: {
          a2uiAction: { userAction: { name: 'add_meal', context: { title: 'Pizza' } } },
        },
      }),
      signal(),
    ),
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ['RUN_STARTED', 'TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'RUN_FINISHED'],
  );
  assert.equal(events[1]!.toolCallName, 'add_meal_to_log');
  assert.equal(events[2]!.delta, '{"title":"Pizza"}');
  assert.equal(fixture.calls.length, 0);
  // Unknown actions or contexts the handler rejects still go to the model.
  const fallback = model([[{ type: 'text', delta: 'Which meal?' }]]);
  const fallbackRun = createBrowserAgent(fallback.client, {
    prompt: 'P',
    maxSteps: 1,
    maxOutputTokens: 50,
    tools: [],
    userActions: { add_meal: () => undefined },
  });
  const fallbackEvents = await collect(
    fallbackRun(
      input({ forwardedProps: { a2uiAction: { userAction: { name: 'add_meal', context: {} } } } }),
      signal(),
    ),
  );
  assert.equal(
    fallbackEvents.find((event) => event.type === 'TEXT_MESSAGE_CONTENT')?.delta,
    'Which meal?',
  );
});

test('a guarded frontend call is withheld and retried with error feedback, then forwarded when valid', async () => {
  const fixture = model([
    [{ type: 'tool_call', name: 'render_ui', arguments: { components: 'nope' } }],
    [{ type: 'tool_call', name: 'render_ui', arguments: { components: ['ok'] } }],
  ]);
  const guard = {
    name: 'render_ui',
    maxAttempts: 3,
    validate: (args: Record<string, unknown>) =>
      Array.isArray(args['components']) ? undefined : 'components must be an array',
    exhausted: (errors: string[]) => ({ code: 'exhausted', errors }),
    retrying: (_call: unknown, attempt: number) =>
      ({
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'ui',
        activityType: 'ui',
        content: { attempt },
      }) as BaseEvent,
  };
  const events = await collect(
    createBrowserAgent(fixture.client, {
      prompt: 'P',
      maxSteps: 1,
      maxOutputTokens: 50,
      tools: [],
      guards: [guard],
    })(
      input({ tools: [{ name: 'render_ui', description: 'UI', parameters: { type: 'object' } }] }),
      signal(),
    ),
  );
  assert.deepEqual(
    events.map((event) => event.type),
    [
      'RUN_STARTED',
      'ACTIVITY_SNAPSHOT',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'RUN_FINISHED',
    ],
  );
  assert.equal(events[2]!.toolCallName, 'render_ui');
  assert.equal(events[3]!.delta, '{"components":["ok"]}');
  assert.equal(fixture.calls.length, 2, 'the correction turn does not consume the step budget');
  assert.deepEqual(fixture.calls[1]!.messages.at(-1), {
    role: 'tool',
    tool_call_id: fixture.calls[1]!.messages.at(-2)!.tool_calls[0].id,
    content: 'components must be an array',
  });
});

test('an exhausted guard forwards the last call with a recovery result the client can show', async () => {
  const fixture = model([
    [{ type: 'tool_call', name: 'render_ui', arguments: {} }],
    [{ type: 'tool_call', name: 'render_ui', arguments: {} }],
    [{ type: 'text', delta: 'Could not draw it.' }],
  ]);
  const guard = {
    name: 'render_ui',
    maxAttempts: 2,
    validate: () => 'always invalid',
    exhausted: (errors: string[]) => ({ code: 'exhausted', attempts: errors }),
  };
  const events = await collect(
    createBrowserAgent(fixture.client, {
      prompt: 'P',
      maxSteps: 2,
      maxOutputTokens: 50,
      tools: [],
      guards: [guard],
    })(
      input({ tools: [{ name: 'render_ui', description: 'UI', parameters: { type: 'object' } }] }),
      signal(),
    ),
  );
  const result = events.find((event) => event.type === 'TOOL_CALL_RESULT');
  assert.deepEqual(JSON.parse(result!.content), {
    code: 'exhausted',
    attempts: ['always invalid', 'always invalid'],
  });
  assert.equal(events.filter((event) => event.type === 'TOOL_CALL_START').length, 1);
  assert.equal(
    events.find((event) => event.type === 'TEXT_MESSAGE_CONTENT')?.delta,
    'Could not draw it.',
  );
  assert.equal(fixture.calls.length, 3);
});

test('an A2UI user action is handled directly once; the follow-up run with the same action is a model turn', async () => {
  const fixture = model([[{ type: 'text', delta: 'Logged Pizza.' }]]);
  const run = createBrowserAgent(fixture.client, {
    prompt: 'P',
    maxSteps: 1,
    maxOutputTokens: 50,
    tools: [],
    userActions: { add_meal: (context) => ({ tool: 'add_meal_to_log', args: context }) },
  });
  const sameAction = () =>
    input({
      tools: [{ name: 'add_meal_to_log', description: 'Add', parameters: { type: 'object' } }],
      forwardedProps: {
        a2uiAction: {
          userAction: {
            name: 'add_meal',
            surfaceId: 's1',
            sourceComponentId: 'b1',
            timestamp: 't1',
            context: { title: 'Pizza' },
          },
        },
      },
    });
  const first = await collect(run(sameAction(), signal()));
  assert.equal(first[1]!.type, 'TOOL_CALL_START');
  // CopilotKit re-runs with the tool result while the action is still attached.
  const second = await collect(run(sameAction(), signal()));
  assert.ok(!second.some((event) => event.type === 'TOOL_CALL_START'));
  assert.equal(
    second.find((event) => event.type === 'TEXT_MESSAGE_CONTENT')?.delta,
    'Logged Pizza.',
  );
  assert.equal(fixture.calls.length, 1);
  // A new click (different timestamp) is handled directly again.
  const next = sameAction();
  (
    next.forwardedProps as { a2uiAction: { userAction: { timestamp: string } } }
  ).a2uiAction.userAction.timestamp = 't2';
  const third = await collect(run(next, signal()));
  assert.equal(third[1]!.type, 'TOOL_CALL_START');
});
