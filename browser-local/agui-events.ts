import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import { macroQuestA2UIToolName } from '../shared/macroquest-agent/agent';
import { mealUIResponseSchema } from '../shared/macroquest-agent/schemas';
import { z } from 'zod';

// This is protocol translation, not UI generation. Layout/behavior come from the model.
const sandboxPolicy = `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"></head>`;
const sandboxSchema = z.object({
  initialHeight: z.number().min(100).max(2000),
  placeholderMessages: z.array(z.string()),
  css: z.string(),
  html: z.string().min(1),
  jsFunctions: z.string(),
  jsExpressions: z.array(z.string()),
});

type Event = BaseEvent & Record<string, any>;

/** Matches CopilotKit's A2UI/OGUI activity envelope without importing a Node runtime. */
export async function* copilotEvents(source: AsyncIterable<BaseEvent>): AsyncGenerator<Event> {
  const tools = new Map<string, { name: string; args: string }>();
  let messageId: string | undefined;
  for await (const raw of source) {
    const event = raw as Event;
    if (event.type === 'TEXT_MESSAGE_CHUNK') {
      if (messageId !== event['messageId']) {
        if (messageId) yield { type: EventType.TEXT_MESSAGE_END, messageId };
        messageId = event['messageId'];
        yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
      }
      if (event['delta'])
        yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: event['delta'] };
      continue;
    }
    if (event.type === 'TOOL_CALL_START')
      tools.set(event['toolCallId'], { name: event['toolCallName'], args: '' });
    const tool = tools.get(event['toolCallId']);
    const renderTool =
      tool?.name === macroQuestA2UIToolName || tool?.name === 'generateSandboxedUi';
    if (event.type === 'TOOL_CALL_ARGS' && tool) {
      tool.args += event['delta'];
      if (tool.args.length > 1_000_000)
        throw new Error('Generated UI exceeded the local safety limit.');
    }
    if (event.type === 'TOOL_CALL_END' && renderTool) {
      const args = JSON.parse(tool.args);
      if (tool.name === macroQuestA2UIToolName) {
        const surface = mealUIResponseSchema.shape.a2ui.parse(args);
        yield {
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId: `a2ui-surface-${event['toolCallId']}`,
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
        };
      } else {
        const widget = sandboxSchema.parse(args);
        yield {
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId: `${event['toolCallId']}-activity`,
          activityType: 'open-generative-ui',
          replace: true,
          content: {
            ...widget,
            html: [sandboxPolicy + widget.html],
            cssComplete: true,
            htmlComplete: true,
            jsFunctionsComplete: true,
            jsExpressionsComplete: true,
            generating: false,
          },
        };
      }
      // Render tools are handled here, not executed by a frontend tool handler.
      // Omit their tool calls entirely, avoiding unresolved calls/continuation loops.
      tools.delete(event['toolCallId']);
      continue;
    }
    if (!renderTool) yield event;
    if (event.type === 'TOOL_CALL_END') tools.delete(event['toolCallId']);
  }
  if (messageId) yield { type: EventType.TEXT_MESSAGE_END, messageId };
}

export async function* runEvents(
  input: RunAgentInput,
  signal: AbortSignal,
  run: (input: RunAgentInput, signal: AbortSignal) => AsyncIterable<BaseEvent>,
): AsyncGenerator<BaseEvent> {
  yield { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId } as BaseEvent;
  try {
    for await (const event of copilotEvents(run(input, signal))) {
      signal.throwIfAborted();
      yield event;
    }
    signal.throwIfAborted();
    yield { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId } as BaseEvent;
  } catch (error) {
    yield {
      type: 'RUN_ERROR',
      message: signal.aborted
        ? 'Local generation cancelled.'
        : error instanceof Error
          ? error.message
          : String(error),
    } as BaseEvent;
  }
}
