/// <reference lib="webworker" />
import { RunAgentInputSchema } from '@ag-ui/core';
import { createMacroQuestAgent } from '../shared/macroquest-agent/agent';
import { latestMessageHasImage } from '../shared/macroquest-agent/agui';
import { runEvents } from './agui-events';
import { loadBrowserModel } from './transformers-model-client';

const worker = self as unknown as DedicatedWorkerGlobalScope;
let run: ReturnType<typeof createMacroQuestAgent> | undefined;
let dispose: (() => Promise<void>) | undefined;
let loading = false;
let active: { threadId: string; controller: AbortController } | undefined;

worker.addEventListener('message', async ({ data, ports }) => {
  const port = ports[0];
  if (!port) return;
  if (data.type === 'load') {
    if (loading || run) {
      port.postMessage({ type: 'error', message: 'Model is already loaded or loading.' });
      port.close();
      return;
    }
    loading = true;
    try {
      const loaded = await loadBrowserModel({
        ...data.options,
        onProgress: (message) => port.postMessage({ type: 'progress', message }),
      });
      dispose = loaded.dispose;
      run = createMacroQuestAgent(loaded.client, {
        maxOutputTokens: 3000,
        copy: {
          modelUnreachable:
            'Local model generation failed. Check the browser console for details, or try a shorter prompt.',
          mealEstimateFailed:
            'The local model could not produce a valid meal estimate. Try a shorter meal description in text.',
        },
      });
      port.postMessage({ type: 'ready', device: loaded.device });
    } catch (error) {
      port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      loading = false;
      port.close();
    }
    return;
  }
  const done = () => {
    port.postMessage({ type: 'done' });
    port.close();
  };
  if (data.route?.includes('/stop/')) {
    const stopped = active?.threadId === decodeURIComponent(data.route.split('/stop/')[1]);
    if (stopped) active!.controller.abort();
    port.postMessage({ type: 'response', body: { stopped } });
    done();
    return;
  }
  if (data.route === 'agent/default/connect') {
    // No server-side history: the existing Angular agent owns the conversation.
    port.postMessage({
      type: 'event',
      event: { type: 'STATE_SNAPSHOT', snapshot: data.input?.state ?? {} },
    });
    port.postMessage({
      type: 'event',
      event: { type: 'MESSAGES_SNAPSHOT', messages: data.input?.messages ?? [] },
    });
    done();
    return;
  }
  const parsed = RunAgentInputSchema.safeParse(data.input);
  if (!parsed.success || !run || active) {
    port.postMessage({
      type: 'event',
      event: {
        type: 'RUN_ERROR',
        message: !parsed.success
          ? 'Invalid AG-UI input.'
          : !run
            ? 'Load Gemma 4 E2B before chatting.'
            : 'Local GPU is busy. Wait for the current response.',
      },
    });
    done();
    return;
  }
  if (latestMessageHasImage(parsed.data.messages)) {
    port.postMessage({
      type: 'event',
      event: {
        type: 'RUN_ERROR',
        message:
          'Photo analysis is not enabled in the browser-local preview. Please describe your meal in text.',
      },
    });
    done();
    return;
  }
  // The shared prompts/schema already define the supported catalog. Omit the
  // SDK's duplicate full catalog schema to keep local prompts concise.
  const localInput = {
    ...parsed.data,
    context: parsed.data.context.filter(
      (entry) =>
        !entry.description.startsWith('A2UI Component Schema') &&
        !entry.description.startsWith('A2UI render tool usage guide'),
    ),
  };
  const controller = new AbortController();
  active = { threadId: parsed.data.threadId, controller };
  port.onmessage = ({ data }) => {
    if (data.type === 'cancel') controller.abort();
  };
  // A tab owns this worker. Heartbeats detect closed/crashed tabs in the SW.
  const heartbeat = setInterval(() => port.postMessage({ type: 'heartbeat' }), 5000);
  try {
    for await (const event of runEvents(localInput, controller.signal, run))
      port.postMessage({ type: 'event', event });
  } finally {
    clearInterval(heartbeat);
    active = undefined;
    done();
  }
});

worker.addEventListener('close', () => {
  active?.controller.abort();
  void dispose?.();
});
