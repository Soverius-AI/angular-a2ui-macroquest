import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import type { AgentRun } from './agent';

/** Guarantees one well-formed AG-UI run: failures and cancellation end in RUN_ERROR. */
export async function* runEvents(
  input: RunAgentInput,
  signal: AbortSignal,
  run: AgentRun,
): AsyncGenerator<BaseEvent> {
  let started = false;
  let finished = false;
  try {
    for await (const event of run(input, signal)) {
      signal.throwIfAborted();
      if (event.type === EventType.RUN_STARTED) started = true;
      if (event.type === EventType.RUN_FINISHED) finished = true;
      yield event;
    }
    signal.throwIfAborted();
    if (!finished) throw new Error('The local agent ended without finishing the run.');
  } catch (error) {
    if (!started)
      yield {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent;
    yield {
      type: EventType.RUN_ERROR,
      message: signal.aborted
        ? 'Local generation cancelled.'
        : error instanceof Error
          ? error.message
          : String(error),
    } as BaseEvent;
  }
}
