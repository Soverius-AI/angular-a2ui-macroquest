/**
 * Open Generative UI transport.
 *
 * This follows CopilotKit's canonical architecture: the model authors the
 * complete generateSandboxedUi argument object, its JSON is streamed as tool
 * argument deltas, and OpenGenerativeUIMiddleware turns those deltas into the
 * progressive sandbox activity. No HTML, CSS, or widget fallback lives here.
 */
import { randomUUID } from 'node:crypto';
import type {
  Context,
  Message,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from '@ag-ui/core';
import { contextBlock, lastUserMessage, userText } from './agui';
import { streamJson } from './model-client';
import { sandboxWidgetResponseFormat } from './schemas';

const generateSandboxedUiToolName = 'generateSandboxedUi';

type OpenGenerativeUIPromptBuilder = (
  prompt: string,
  context: string,
  validationFeedback?: string,
) => string;

export async function* streamOpenGenerativeUIToolEvents(
  parentMessageId: string,
  messages: Message[],
  context: Context[],
  abortSignal: AbortSignal,
  options: {
    buildPrompt: OpenGenerativeUIPromptBuilder;
    maxTokens: number;
  },
): AsyncGenerator<ToolCallStartEvent | ToolCallArgsEvent | ToolCallEndEvent> {
  const prompt = userText(lastUserMessage(messages)?.content ?? '');
  const modelStream = streamJson({
    prompt: options.buildPrompt(prompt, contextBlock(context)),
    responseFormat: sandboxWidgetResponseFormat,
    maxTokens: options.maxTokens,
    temperature: 0,
    abortSignal,
  });
  const iterator = modelStream[Symbol.asyncIterator]();

  // Do not announce a tool call until the model endpoint has returned its
  // first argument chunk. A connection failure therefore produces a normal
  // assistant error instead of a permanently "generating" sandbox.
  const first = await iterator.next();
  if (first.done || !first.value) {
    throw new Error('Model returned no sandbox UI arguments.');
  }

  const toolCallId = randomUUID();
  const startEvent: ToolCallStartEvent = {
    type: 'TOOL_CALL_START',
    parentMessageId,
    toolCallId,
    toolCallName: generateSandboxedUiToolName,
  };
  const firstArgsEvent: ToolCallArgsEvent = {
    type: 'TOOL_CALL_ARGS',
    toolCallId,
    delta: first.value,
  };
  yield startEvent;
  yield firstArgsEvent;

  let generatedCharacters = first.value.length;
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    if (!next.value) continue;
    generatedCharacters += next.value.length;
    const argsEvent: ToolCallArgsEvent = {
      type: 'TOOL_CALL_ARGS',
      toolCallId,
      delta: next.value,
    };
    yield argsEvent;
  }

  const endEvent: ToolCallEndEvent = {
    type: 'TOOL_CALL_END',
    toolCallId,
  };
  yield endEvent;
  console.log(`[open-generative-ui] streamed ${generatedCharacters} model-authored characters.`);
}
