/**
 * AG-UI message plumbing: reading the run input (messages, context,
 * forwardedProps) and emitting the events the agent streams back. No model
 * calls and no business logic live here.
 */
import { randomUUID } from 'node:crypto';
import type {
  AssistantMessage,
  Context,
  Message,
  TextMessageChunkEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
  UserMessage,
} from '@ag-ui/core';
import { a2uiApplyActionSchema } from './schemas';

export function userText(content: UserMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export function userImageUrl(content: UserMessage['content']): string | undefined {
  if (typeof content === 'string') return undefined;
  const image = content.find((part) => part.type === 'image');
  if (!image) return undefined;
  return image.source.type === 'data'
    ? `data:${image.source.mimeType};base64,${image.source.value}`
    : image.source.value;
}

export const isUser = (message: Message): message is UserMessage => message.role === 'user';
export const isAssistant = (message: Message): message is AssistantMessage =>
  message.role === 'assistant';

export function lastUserMessage(messages: Message[]): UserMessage | undefined {
  return [...messages].reverse().find(isUser);
}

export function latestMessageHasImage(messages: Message[]): boolean {
  const latest = messages.at(-1);
  return latest !== undefined && isUser(latest) && userImageUrl(latest.content) !== undefined;
}

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Conversation history as plain chat messages for the model. Tool traffic is
 * skipped; attached images are replaced with a marker so the text history
 * stays small.
 */
export function toChatHistory(messages: Message[], limit: number): ChatHistoryMessage[] {
  const history: ChatHistoryMessage[] = [];

  for (const message of messages) {
    if (isUser(message)) {
      const marker = userImageUrl(message.content) ? '\n[user attached a food photo]' : '';
      const text = `${userText(message.content)}${marker}`.trim();
      if (text) history.push({ role: 'user', content: text });
    } else if (isAssistant(message) && message.content?.trim()) {
      history.push({ role: 'assistant', content: message.content });
    }
  }

  return history.slice(-limit);
}

export function historyDigest(messages: Message[], limit: number): string {
  return toChatHistory(messages, limit)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
}

/**
 * Trusted Angular store state forwarded by the frontend via
 * connectAgentContext. This is what lets the model answer questions about
 * logged meals, goals, and remaining macros.
 */
export function contextBlock(context: Context[]): string {
  const lines = context
    .filter((entry) => entry.value.trim())
    .map((entry) => `- ${entry.description || 'context'}: ${entry.value}`);

  return lines.length > 0 ? `Trusted app state:\n${lines.join('\n')}` : '';
}

/**
 * The tool whose result ended the previous run, when the current run is a
 * tool-result continuation (last message has role "tool"). The runtime
 * re-invokes the agent after every frontend tool result; without this check
 * those continuation runs were misrouted into a fresh meal analysis.
 */
export function trailingToolResult(messages: Message[]): { toolName: string } | undefined {
  const last = messages.at(-1);
  if (!last || last.role !== 'tool') return undefined;

  const toolCallId = last.toolCallId;
  const call = messages
    .filter(isAssistant)
    .flatMap((message) => message.toolCalls ?? [])
    .find((toolCall) => toolCall.id === toolCallId);

  return { toolName: call?.function.name ?? '' };
}

/** The a2uiAction the Angular surface forwards when an apply button is pressed. */
export function getApplyMealDraftAction(forwardedProps: unknown) {
  const action = a2uiApplyActionSchema.safeParse(
    (forwardedProps as Record<string, unknown> | undefined)?.a2uiAction,
  );
  if (!action.success || action.data.userAction.name !== 'applyMealDraft') {
    return undefined;
  }

  const {
    surfaceId = 'macroquest-meal-analysis',
    sourceComponentId = '',
    timestamp = '',
  } = action.data.userAction;
  return { surfaceId, actionKey: `${surfaceId}:${sourceComponentId}:${timestamp}` };
}

// ---------------------------------------------------------------------------
// Outgoing AG-UI events
// ---------------------------------------------------------------------------

export function textChunk(messageId: string, delta: string): TextMessageChunkEvent {
  return {
    type: 'TEXT_MESSAGE_CHUNK',
    role: 'assistant',
    messageId,
    delta,
  };
}

export function* toolCallEvents(
  parentMessageId: string,
  toolCallName: string,
  args: unknown,
): Generator<ToolCallStartEvent | ToolCallArgsEvent | ToolCallEndEvent> {
  const toolCallId = randomUUID();
  const startEvent: ToolCallStartEvent = {
    type: 'TOOL_CALL_START',
    parentMessageId,
    toolCallId,
    toolCallName,
  };
  const argsEvent: ToolCallArgsEvent = {
    type: 'TOOL_CALL_ARGS',
    toolCallId,
    delta: JSON.stringify(args),
  };
  const endEvent: ToolCallEndEvent = {
    type: 'TOOL_CALL_END',
    toolCallId,
  };

  yield startEvent;
  yield argsEvent;
  yield endEvent;
}
