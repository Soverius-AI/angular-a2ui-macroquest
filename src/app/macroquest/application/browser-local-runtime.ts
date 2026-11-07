import { InjectionToken, signal } from '@angular/core';

export const defaultBrowserModel = 'onnx-community/gemma-4-E2B-it-ONNX';
export const BROWSER_LOCAL_RUNTIME = new InjectionToken<BrowserLocalRuntime>(
  'Browser-local runtime',
);

/** Tab-scoped owner. GPU state survives service-worker suspension, not page reloads. */
export class BrowserLocalRuntime {
  readonly status = signal('Ready to load. No model has been downloaded.');
  readonly loading = signal(false);
  readonly ready = signal(false);
  readonly device = signal<'webgpu' | 'wasm' | null>(null);
  private worker?: Worker;
  private cancelLoad?: (error: Error) => void;
  private readonly requests = new Map<MessagePort, MessagePort>();

  async load(model: string, cache = true, allowWasmFallback = true): Promise<void> {
    if (this.loading() || this.ready()) return;
    this.loading.set(true);
    this.device.set(null);
    this.status.set('Checking local inference support…');
    try {
      if (!allowWasmFallback && !(navigator as Navigator & { gpu?: unknown }).gpu)
        throw new Error(
          'WebGPU is unavailable. Use a WebGPU-enabled Chrome or Edge browser over HTTPS (or localhost).',
        );
      this.worker = new Worker(new URL('browser-local/agent-worker.js', document.baseURI), {
        type: 'module',
        name: 'macroquest-transformers-gemma4',
      });
      this.worker.onerror = (event) => {
        const message = event.message || 'The GPU worker stopped. Reload to retry.';
        this.status.set(message);
        this.ready.set(false);
        this.device.set(null);
        this.worker?.terminate();
        this.worker = undefined;
        this.cancelLoad?.(new Error(message));
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
        this.cancelLoad = reject;
        channel.port1.onmessage = ({ data }) => {
          if (data.type === 'progress') this.status.set(data.message);
          if (data.type === 'ready' || data.type === 'error') {
            channel.port1.close();
            this.cancelLoad = undefined;
            if (data.type === 'ready' && (data.device === 'webgpu' || data.device === 'wasm')) {
              this.device.set(data.device);
              resolve();
            } else
              reject(new Error(data.message || 'The model did not report its execution device.'));
          }
        };
        this.worker!.postMessage(
          {
            type: 'load',
            options: {
              model,
              cache,
              allowWasmFallback,
              wasmUrl: new URL('browser-local/ort/', document.baseURI).href,
            },
          },
          [channel.port2],
        );
      });
      this.ready.set(true);
      this.status.set(
        `Gemma 4 E2B is running locally with Transformers.js on ${this.device() === 'webgpu' ? 'WebGPU' : 'WASM / CPU'}.`,
      );
    } catch (error) {
      this.device.set(null);
      this.worker?.terminate();
      this.worker = undefined;
      this.status.set(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  cancel(): void {
    this.cancelLoad?.(
      new Error('Model loading cancelled. Cached files may remain in browser storage.'),
    );
  }

  forward(data: unknown, port: MessagePort): void {
    if (!this.worker) {
      port.postMessage({
        type: 'event',
        event: { type: 'RUN_ERROR', message: 'Load the local model first.' },
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
export async function initializeBrowserLocalRuntime(): Promise<BrowserLocalRuntime> {
  if (!isSecureContext || !('serviceWorker' in navigator))
    throw new Error(
      'Browser-local inference needs HTTPS (or localhost) and service-worker support.',
    );
  const runtime = new BrowserLocalRuntime();
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (
      event.source !== navigator.serviceWorker.controller ||
      event.data?.type !== 'macroquest-local-request' ||
      !event.ports[0]
    )
      return;
    runtime.forward(event.data, event.ports[0]);
  });
  const script = new URL('browser-local-sw.js', document.baseURI).href;
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
      reject(new Error('Local service worker did not take control. Reload the page.'));
    }, 15_000);
    navigator.serviceWorker.addEventListener('controllerchange', claimed);
    claimed();
  });
  return runtime;
}
