/**
 * Browser counterpart of CopilotKit's BuiltInAgent (server/agent.ts): the model owns tool
 * selection. Local tools run in the worker; frontend tools end the run for the client.
 */
import {
  EventType,
  type BaseEvent,
  type Message,
  type RunAgentInput,
  type Tool,
} from '@ag-ui/core';
import type { ChatMessage, ModelClient, ToolCall, ToolDefinition } from './model-client';

export interface LocalToolContext {
  messages: Message[];
  abortSignal: AbortSignal;
}

export interface LocalTool {
  definition: ToolDefinition;
  /** Yields AG-UI events (such as activity snapshots) while running; returns the tool result. */
  execute(
    args: Record<string, unknown>,
    context: LocalToolContext,
  ): AsyncGenerator<BaseEvent, unknown>;
}

/**
 * Validation-and-retry for a frontend tool, like the A2UI recovery in CopilotKit's runtime:
 * an invalid call is answered with its errors and the model tries again, up to maxAttempts.
 */
export interface ToolGuard {
  name: string;
  maxAttempts: number;
  /** Error text for the model, or undefined when the call is valid. */
  validate(args: Record<string, unknown>, input: RunAgentInput): string | undefined;
  /** Tool result content sent when every attempt failed. */
  exhausted(errors: string[]): unknown;
  /** Progress event while retrying, shown by the client instead of the withheld call. */
  retrying?(call: ToolCall, attempt: number, errors: string): BaseEvent;
}

/**
 * Maps an A2UI user action (by its event name) to a frontend tool call built from the
 * action's context, or undefined to let the model handle it.
 */
export type UserActionHandlers = Record<
  string,
  (context: Record<string, unknown>) => { tool: string; args: Record<string, unknown> } | undefined
>;

export interface BrowserAgentOptions {
  prompt: string;
  maxSteps: number;
  maxOutputTokens: number;
  tools: LocalTool[];
  guards?: ToolGuard[];
  userActions?: UserActionHandlers;
}

/**
 * CopilotKit keeps the `a2uiAction` run property attached while it re-runs the agent with
 * the frontend tool's result, so the same action arrives on every follow-up run. Each
 * action is handled directly exactly once; later runs carrying it are ordinary model turns.
 */
function directToolCall(
  input: RunAgentInput,
  handlers: UserActionHandlers | undefined,
  handled: Set<string>,
): ToolCall | undefined {
  const action = (
    input.forwardedProps as
      | {
          a2uiAction?: {
            userAction?: {
              name?: string;
              context?: unknown;
              surfaceId?: string;
              sourceComponentId?: string;
              timestamp?: string;
            };
          };
        }
      | undefined
  )?.a2uiAction?.userAction;
  if (!action?.name || !handlers?.[action.name]) return undefined;
  const key = JSON.stringify([
    action.name,
    action.surfaceId,
    action.sourceComponentId,
    action.timestamp,
    action.context,
  ]);
  if (handled.has(key)) return undefined;
  handled.add(key);
  if (handled.size > 200) handled.delete(handled.values().next().value!);
  const context =
    action.context && typeof action.context === 'object'
      ? (action.context as Record<string, unknown>)
      : {};
  const call = handlers[action.name]!(context);
  if (!call || !input.tools.some((tool) => (tool as Tool).name === call.tool)) return undefined;
  return {
    id: crypto.randomUUID(),
    type: 'function',
    function: { name: call.tool, arguments: call.args },
  };
}

export type AgentRun = (input: RunAgentInput, signal: AbortSignal) => AsyncGenerator<BaseEvent>;

export function createBrowserAgent(client: ModelClient, options: BrowserAgentOptions): AgentRun {
  const localTools = new Map(options.tools.map((tool) => [tool.definition.function.name, tool]));
  const guards = new Map((options.guards ?? []).map((guard) => [guard.name, guard]));
  const handledActions = new Set<string>();
  return async function* run(input, signal) {
    yield {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    } as BaseEvent;
    const direct = directToolCall(input, options.userActions, handledActions);
    if (direct) {
      // The outcome is fixed by the action itself: call the frontend tool, no model turn.
      yield* toolCallEvents(direct, crypto.randomUUID());
      yield {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent;
      return;
    }
    const messages = toChatMessages(input, options.prompt);
    const tools: ToolDefinition[] = [
      ...(input.tools as Tool[]).map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as Record<string, unknown>,
        },
      })),
      ...options.tools.map((tool) => tool.definition),
    ];
    const attempts = new Map<string, string[]>();
    let unreadableCalls = 0;
    for (let step = 0; step < options.maxSteps;) {
      const messageId = crypto.randomUUID();
      let text = '';
      const calls: ToolCall[] = [];
      const unreadable: { name: string; raw: string; error: string }[] = [];
      for await (const chunk of client.streamChat({
        messages,
        tools,
        maxTokens: options.maxOutputTokens,
        abortSignal: signal,
      })) {
        if (chunk.type === 'text') {
          if (!text)
            yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent;
          text += chunk.delta;
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: chunk.delta,
          } as BaseEvent;
          continue;
        }
        if (chunk.type === 'tool_call_error') {
          unreadable.push(chunk);
          continue;
        }
        calls.push({
          id: crypto.randomUUID(),
          type: 'function',
          function: { name: chunk.name, arguments: chunk.arguments },
        });
      }
      if (text) yield { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent;
      if (unreadable.length) {
        // One deterministic correction turn, as the runtime does for invalid tool output.
        if (unreadableCalls++ >= 1)
          throw new Error(
            `The model's call to ${unreadable[0]!.name} could not be read twice: ${unreadable[0]!.error}`,
          );
        messages.push({
          role: 'assistant',
          content: [text, ...unreadable.map((call) => `[unreadable tool call] ${call.raw}`)]
            .filter(Boolean)
            .join('\n'),
        });
        messages.push({
          role: 'user',
          content: unreadable
            .map(
              (call) =>
                `Your call to ${call.name} could not be read (${call.error}). Call it again with complete, well-formed arguments.`,
            )
            .join('\n'),
        });
        continue;
      }
      messages.push({
        role: 'assistant',
        content: text,
        ...(calls.length ? { tool_calls: calls } : {}),
      });
      if (calls.length === 0) break;
      let pendingFrontendCall = false;
      let retrying = false;
      for (const call of calls) {
        const guard = guards.get(call.function.name);
        const errors = guard?.validate(call.function.arguments, input);
        if (guard && errors !== undefined) {
          const failed = attempts.get(guard.name) ?? [];
          failed.push(errors);
          attempts.set(guard.name, failed);
          if (failed.length < guard.maxAttempts) {
            // The invalid call stays out of the client's view; the model sees it with its errors.
            if (guard.retrying) yield guard.retrying(call, failed.length, errors);
            messages.push({ role: 'tool', tool_call_id: call.id, content: errors });
            retrying = true;
            continue;
          }
          yield* toolCallEvents(call, messageId);
          yield* toolResult(call, guard.exhausted(failed), messages);
          continue;
        }
        yield* toolCallEvents(call, messageId);
        const tool = localTools.get(call.function.name);
        if (!tool) {
          pendingFrontendCall = true;
          continue;
        }
        const result = yield* execute(tool, call, {
          messages: input.messages,
          abortSignal: signal,
        });
        yield* toolResult(call, result, messages);
      }
      // Like the AI SDK loop: a tool call without a result (frontend tool) ends the run.
      if (pendingFrontendCall) break;
      // A guarded retry is a correction turn, not one of the agent's steps.
      if (!retrying) step++;
    }
    yield {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    } as BaseEvent;
  };
}

function* toolCallEvents(call: ToolCall, parentMessageId: string): Generator<BaseEvent> {
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId: call.id,
    toolCallName: call.function.name,
    parentMessageId,
  } as BaseEvent;
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: call.id,
    delta: JSON.stringify(call.function.arguments),
  } as BaseEvent;
  yield { type: EventType.TOOL_CALL_END, toolCallId: call.id } as BaseEvent;
}

function* toolResult(
  call: ToolCall,
  result: unknown,
  messages: ChatMessage[],
): Generator<BaseEvent> {
  const content = JSON.stringify(result);
  yield {
    type: EventType.TOOL_CALL_RESULT,
    messageId: crypto.randomUUID(),
    toolCallId: call.id,
    content,
    role: 'tool',
  } as BaseEvent;
  messages.push({ role: 'tool', tool_call_id: call.id, content });
}

async function* execute(
  tool: LocalTool,
  call: ToolCall,
  context: LocalToolContext,
): AsyncGenerator<BaseEvent, unknown> {
  try {
    return yield* tool.execute(call.function.arguments, context);
  } catch (error) {
    if (context.abortSignal.aborted) throw error;
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Same system-prompt layout as BuiltInAgent: prompt, application context, then state. */
export function toChatMessages(input: RunAgentInput, prompt: string): ChatMessage[] {
  const parts = [prompt];
  if (input.context?.length) {
    parts.push('\n## Context from the application\n');
    for (const entry of input.context) parts.push(`${entry.description}:\n${entry.value}\n`);
  }
  const state = input.state;
  if (
    state !== undefined &&
    state !== null &&
    !(typeof state === 'object' && Object.keys(state).length === 0)
  )
    parts.push(
      `\n## Application State\nThis is state from the application that you can edit by calling AGUISendStateSnapshot or AGUISendStateDelta.\n\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\`\n`,
    );
  const messages: ChatMessage[] = [{ role: 'system', content: parts.join('') }];
  for (const message of input.messages as Message[]) {
    if (message.role === 'user') {
      messages.push({ role: 'user', content: userContent(message.content) });
    } else if (message.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: typeof message.content === 'string' ? message.content : '',
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: {
                  name: call.function.name,
                  arguments: parseArguments(call.function.arguments),
                },
              })),
            }
          : {}),
      });
    } else if (message.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content:
          typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      });
    }
    // System, developer, reasoning and activity messages are not forwarded, as in BuiltInAgent.
  }
  return messages;
}

function userContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const texts: string[] = [];
  let attachments = 0;
  for (const part of content as { type?: string; text?: string }[]) {
    if (part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
    else attachments++;
  }
  if (attachments)
    texts.push(
      `(The user attached ${attachments} file(s). Call analyze_meal to analyze an attached meal photo.)`,
    );
  return texts.join('\n');
}

function parseArguments(args: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(args);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
    return { value: parsed };
  } catch {
    return { value: args };
  }
}
