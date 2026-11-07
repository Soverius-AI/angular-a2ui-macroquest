/// <reference lib="webworker" />
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { macroQuestMaxSteps, macroQuestPrompt } from '../contracts/macroquest-agent';
import { createBrowserAgent, type AgentRun } from './agent';
import { runEvents } from './agui-events';
import { createAnalyzeMealTool } from './analyze-meal';
import { a2uiGuard, withGenerativeUI } from './generative-ui';
import { createOpenAICompatibleModelClient } from './openai-compatible-model-client';
import { providers, type ProviderId } from './providers';
import { macroQuestUserActions } from './user-actions';

const worker = self as unknown as DedicatedWorkerGlobalScope;
let run: AgentRun | undefined;
let active: { threadId: string; controller: AbortController } | undefined;

/**
 * The API key arrives once over postMessage and is captured in the client closure: it is
 * never stored, and leaves this worker only in the Authorization header to the provider.
 */
function connect(options: { provider: ProviderId; apiKey?: string; model?: string }): void {
  const provider = providers[options.provider];
  if (!provider) throw new Error(`Unknown provider: ${options.provider}`);
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new Error(`Paste your ${provider.name} API key to connect.`);
  const client = createOpenAICompatibleModelClient({
    baseUrl: provider.baseUrl,
    apiKey,
    model: options.model?.trim() || provider.defaultModel,
    headers: provider.headers,
    body: provider.body,
  });
  run = withGenerativeUI(
    createBrowserAgent(client, {
      prompt: macroQuestPrompt,
      maxSteps: macroQuestMaxSteps,
      maxOutputTokens: 8192,
      tools: [createAnalyzeMealTool(client)],
      guards: [a2uiGuard],
      userActions: macroQuestUserActions,
    }),
  );
}

worker.addEventListener('message', async ({ data, ports }) => {
  const port = ports[0];
  if (!port) return;
  if (data.type === 'connect') {
    try {
      connect(data.options);
      port.postMessage({ type: 'ready' });
    } catch (error) {
      port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
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
    // No server-side history: the Angular client owns the conversation.
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
            ? 'Connect a provider with your API key before chatting.'
            : 'A response is still running. Wait for it to finish.',
      },
    });
    done();
    return;
  }
  const controller = new AbortController();
  active = { threadId: parsed.data.threadId, controller };
  port.onmessage = ({ data }) => {
    if (data.type === 'cancel') controller.abort();
  };
  // A tab owns this worker. Heartbeats detect closed/crashed tabs in the SW.
  const heartbeat = setInterval(() => port.postMessage({ type: 'heartbeat' }), 5000);
  try {
    for await (const event of runEvents(parsed.data, controller.signal, run))
      port.postMessage({ type: 'event', event });
  } finally {
    clearInterval(heartbeat);
    active = undefined;
    done();
  }
});

worker.addEventListener('close', () => {
  active?.controller.abort();
});
