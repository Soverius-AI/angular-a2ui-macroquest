/**
 * The same generative-UI middlewares CopilotKit's runtime applies to the Node agent,
 * applied in the worker: A2UI (`render_a2ui` to `a2ui-surface` activities) and Open
 * Generative UI (`generateSandboxedUi` to `open-generative-ui` activities).
 */
import {
  A2UIMiddleware,
  A2UI_SCHEMA_CONTEXT_DESCRIPTION,
  RENDER_A2UI_TOOL_NAME,
} from '@ag-ui/a2ui-middleware';
import { AbstractAgent, type BaseEvent, type Middleware, type RunAgentInput } from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import {
  MAX_A2UI_ATTEMPTS,
  formatValidationErrors,
  validateA2UIComponents,
} from '@ag-ui/a2ui-toolkit';
import { OpenGenerativeUIMiddleware } from '@copilotkit/shared/event-transforms';
import { Observable } from 'rxjs';
import type { AgentRun, ToolGuard } from './agent';

/** Component names from the client's inline catalog schema, for validation. */
function catalogComponents(
  input: RunAgentInput,
): Record<string, Record<string, unknown>> | undefined {
  const entry = input.context?.find((item) => item.description === A2UI_SCHEMA_CONTEXT_DESCRIPTION);
  if (!entry) return undefined;
  try {
    const schema = JSON.parse(entry.value) as { components?: Record<string, unknown> };
    if (!schema.components) return undefined;
    return Object.fromEntries(Object.keys(schema.components).map((name) => [name, {}]));
  } catch {
    return undefined;
  }
}

/** Mirrors the runtime's A2UI recovery: validate, feed errors back, give up after MAX_A2UI_ATTEMPTS. */
export const a2uiGuard: ToolGuard = {
  name: RENDER_A2UI_TOOL_NAME,
  maxAttempts: MAX_A2UI_ATTEMPTS,
  validate(args, input) {
    const errors: string[] = [];
    if (typeof args['surfaceId'] !== 'string' || !args['surfaceId'])
      errors.push(
        '- [missing_surface_id] surfaceId: provide a short lowercase string id for the surface',
      );
    const components = args['components'];
    if (!Array.isArray(components)) {
      errors.push('- [empty_components] components: must be a flat, non-empty array of components');
    } else {
      components.forEach((component, index) => {
        if (!component || typeof component !== 'object') return;
        const { child, children } = component as { child?: unknown; children?: unknown };
        if (child !== undefined && typeof child !== 'string')
          errors.push(
            `- [nested_child] components[${index}].child: must be the id of another component, not an object`,
          );
        const idList =
          Array.isArray(children) && children.every((entry) => typeof entry === 'string');
        const template =
          !!children &&
          typeof children === 'object' &&
          !Array.isArray(children) &&
          'componentId' in children;
        if (children !== undefined && !idList && !template)
          errors.push(
            `- [nested_children] components[${index}].children: must be an array of component ids, not nested objects`,
          );
      });
      const catalog = catalogComponents(input);
      const result = validateA2UIComponents({
        components: components as Record<string, unknown>[],
        ...(catalog ? { catalog: { components: catalog } } : {}),
        validateBindings: false,
      });
      if (!result.valid) errors.push(formatValidationErrors(result.errors));
    }
    if (!errors.length) return undefined;
    return `The render_a2ui call was rejected. Fix these and call it again with the complete arguments:\n${errors.join('\n')}`;
  },
  exhausted(errors) {
    return { code: 'a2ui_recovery_exhausted', error: errors.at(-1), attempts: errors };
  },
  retrying(call, attempt, errors) {
    return {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: `a2ui-surface-${call.id}`,
      activityType: 'a2ui-surface',
      replace: true,
      content: { status: 'retrying', attempt: attempt + 1, maxAttempts: MAX_A2UI_ATTEMPTS, errors },
    } as BaseEvent;
  },
};

class LocalAgent extends AbstractAgent {
  constructor(
    private readonly runLocal: AgentRun,
    private readonly signal: AbortSignal,
  ) {
    super({ agentId: 'default' });
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const iterator = this.runLocal(input, this.signal);
      let closed = false;
      void (async () => {
        try {
          for await (const event of iterator) {
            if (closed) return;
            subscriber.next(event);
          }
          subscriber.complete();
        } catch (error) {
          if (!closed) subscriber.error(error);
        }
      })();
      return () => {
        closed = true;
        void iterator.return(undefined);
      };
    });
  }
}

class MiddlewareAgent extends AbstractAgent {
  constructor(
    private readonly middleware: Middleware,
    private readonly next: AbstractAgent,
  ) {
    super({ agentId: 'default' });
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return this.middleware.run(input, this.next);
  }
}

export function withGenerativeUI(run: AgentRun): AgentRun {
  return async function* (input, signal) {
    // Mirrors configureAgentForRequest in @copilotkit/runtime.
    const catalogAvailable =
      (input.forwardedProps as { a2uiCatalogAvailable?: unknown } | undefined)
        ?.a2uiCatalogAvailable === true;
    const a2ui = new A2UIMiddleware({ injectA2UITool: catalogAvailable ? true : undefined });
    const agent = new MiddlewareAgent(
      new OpenGenerativeUIMiddleware(),
      new MiddlewareAgent(a2ui, new LocalAgent(run, signal)),
    );
    yield* toAsyncIterable(agent.run(input));
  };
}

async function* toAsyncIterable<T>(source: Observable<T>): AsyncGenerator<T> {
  const queue: T[] = [];
  let done = false;
  let failed = false;
  let failure: unknown;
  let wake: (() => void) | undefined;
  const subscription = source.subscribe({
    next: (value) => {
      queue.push(value);
      wake?.();
    },
    error: (error) => {
      failed = true;
      failure = error;
      done = true;
      wake?.();
    },
    complete: () => {
      done = true;
      wake?.();
    },
  });
  try {
    while (!done || queue.length) {
      if (queue.length) yield queue.shift()!;
      else
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
    }
    if (failed) throw failure;
  } finally {
    subscription.unsubscribe();
  }
}
