import { computed, InjectionToken, signal } from '@angular/core';
import {
  defaultProvider,
  providerIds,
  providers,
  type ProviderId,
} from '../../../../byok/providers';

export { defaultProvider, providerIds, providers, type ProviderId };

export const BYOK_RUNTIME = new InjectionToken<ByokRuntime>('Bring-your-own-key runtime');

/**
 * Tab-scoped owner of the agent worker. The worker receives the API key once and keeps it
 * in memory; nothing here or in storage retains it.
 */
export class ByokRuntime {
  readonly status = signal('Not connected. Pick a provider and paste your API key.');
  readonly connecting = signal(false);
  readonly ready = signal(false);
  readonly provider = signal<ProviderId>(defaultProvider);
  readonly model = signal('');
  readonly providerName = computed(() => providers[this.provider()].name);
  private worker?: Worker;
  private readonly requests = new Map<MessagePort, MessagePort>();

  async connect(provider: ProviderId, apiKey: string, model?: string): Promise<void> {
    if (this.connecting() || this.ready()) return;
    this.connecting.set(true);
    this.provider.set(provider);
    this.model.set(model?.trim() || providers[provider].defaultModel);
    this.status.set(`Connecting to ${providers[provider].name}…`);
    try {
      this.worker = new Worker(new URL('byok/agent-worker.js', document.baseURI), {
        type: 'module',
        name: 'macroquest-agent',
      });
      this.worker.onerror = (event) => {
        const message = event.message || 'The agent worker stopped. Reload to retry.';
        this.status.set(message);
        this.ready.set(false);
        this.worker?.terminate();
        this.worker = undefined;
        for (const [port, relay] of this.requests) {
          relay.close();
          port.postMessage({ type: 'event', event: { type: 'RUN_ERROR', message } });
          port.postMessage({ type: 'done' });
          port.close();
        }
        this.requests.clear();
      };
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = ({ data }) => {
          channel.port1.close();
          if (data.type === 'ready') resolve();
          else reject(new Error(data.message || 'The worker did not connect.'));
        };
        this.worker!.postMessage(
          { type: 'connect', options: { provider, apiKey, model: this.model() } },
          [channel.port2],
        );
      });
      this.ready.set(true);
      this.status.set(
        `${this.model()} answers through ${providers[provider].name}. Your key stays in this tab.`,
      );
    } catch (error) {
      this.worker?.terminate();
      this.worker = undefined;
      this.status.set(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.connecting.set(false);
    }
  }

  /** Terminates the worker, and the key with it, so another provider or key can be used. */
  disconnect(): void {
    if (this.connecting()) return;
    this.worker?.terminate();
    this.worker = undefined;
    for (const [port, relay] of this.requests) {
      relay.close();
      port.postMessage({
        type: 'event',
        event: { type: 'RUN_ERROR', message: 'The provider was disconnected.' },
      });
      port.postMessage({ type: 'done' });
      port.close();
    }
    this.requests.clear();
    this.ready.set(false);
    this.status.set('Disconnected. The key was discarded.');
  }

  forward(data: unknown, port: MessagePort): void {
    if (!this.worker) {
      port.postMessage({
        type: 'event',
        event: { type: 'RUN_ERROR', message: 'Connect a provider first.' },
      });
      port.postMessage({ type: 'done' });
      port.close();
      return;
    }
    const channel = new MessageChannel();
    this.requests.set(port, channel.port1);
    channel.port1.onmessage = ({ data }) => {
      port.postMessage(data);
      if (data.type === 'done') {
        this.requests.delete(port);
        channel.port1.close();
        port.close();
      }
    };
    port.onmessage = ({ data }) => channel.port1.postMessage(data);
    this.worker.postMessage(data, [channel.port2]);
  }
}

/** Install and claim before CopilotKit makes its first /info request. */
export async function initializeByokRuntime(): Promise<ByokRuntime> {
  if (!isSecureContext || !('serviceWorker' in navigator))
    throw new Error('This mode needs HTTPS (or localhost) and service-worker support.');
  const runtime = new ByokRuntime();
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (
      event.source !== navigator.serviceWorker.controller ||
      event.data?.type !== 'macroquest-local-request' ||
      !event.ports[0]
    )
      return;
    runtime.forward(event.data, event.ports[0]);
  });
  const script = new URL('byok-sw.js', document.baseURI).href;
  await navigator.serviceWorker.register(script, {
    scope: new URL('.', document.baseURI).pathname,
    type: 'module',
    updateViaCache: 'none',
  });
  await new Promise<void>((resolve, reject) => {
    const claimed = () => {
      if (navigator.serviceWorker.controller?.scriptURL === script) {
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', claimed);
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', claimed);
      reject(new Error('The service worker did not take control. Reload the page.'));
    }, 15_000);
    navigator.serviceWorker.addEventListener('controllerchange', claimed);
    claimed();
  });
  return runtime;
}
