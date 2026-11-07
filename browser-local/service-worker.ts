/// <reference lib="webworker" />
/** HTTP facade only. The requesting tab owns its GPU worker, never this SW. */
const sw = self as unknown as ServiceWorkerGlobalScope;
const apiPath = new URL('api/browser-local/copilotkit/', sw.registration.scope).pathname;
const encoder = new TextEncoder();

sw.addEventListener('install', (event) => event.waitUntil(sw.skipWaiting()));
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== sw.location.origin || !url.pathname.startsWith(apiPath)) return;
  const route = url.pathname.slice(apiPath.length);
  if (route === 'info' && event.request.method === 'GET') {
    event.respondWith(
      Response.json({
        version: '1.63.1',
        agents: {
          default: {
            name: 'default',
            description: 'Browser-local Gemma 4 E2B via Transformers.js and ONNX Runtime Web',
            className: 'BrowserLocalAgent',
          },
        },
        mode: 'sse',
        audioFileTranscriptionEnabled: false,
        threadEndpoints: { list: false, inspect: false, mutations: false, realtimeMetadata: false },
        suggestions: false,
        a2uiEnabled: true,
        a2ui: { enabled: true },
        openGenerativeUIEnabled: true,
        telemetryDisabled: true,
      }),
    );
    return;
  }
  if (
    !/^agent\/default\/(run|connect|stop\/[^/]+)$/.test(route) ||
    event.request.method !== 'POST'
  ) {
    event.respondWith(
      Response.json({ error: 'Unsupported browser-local runtime endpoint' }, { status: 404 }),
    );
    return;
  }
  let finish!: () => void;
  const lifetime = new Promise<void>((resolve) => {
    finish = resolve;
  });
  event.waitUntil(lifetime);
  event.respondWith(
    bridge(event, route, finish).catch((error) => {
      finish();
      return Response.json({ error: String(error) }, { status: 503 });
    }),
  );
});

async function bridge(event: FetchEvent, route: string, finish: () => void): Promise<Response> {
  const client = await sw.clients.get(event.clientId);
  if (!client) throw new Error('The local inference tab is no longer available. Reload the page.');
  const input = route.includes('/stop/') ? undefined : await event.request.json();
  const channel = new MessageChannel();
  if (route.includes('/stop/')) {
    return new Promise<Response>((resolve) => {
      const timeout = setTimeout(() => {
        channel.port1.close();
        finish();
        resolve(Response.json({ error: 'Local inference tab did not respond.' }, { status: 503 }));
      }, 5000);
      channel.port1.onmessage = ({ data }) => {
        if (data.type !== 'response') return;
        clearTimeout(timeout);
        channel.port1.close();
        finish();
        resolve(Response.json(data.body));
      };
      client.postMessage({ type: 'macroquest-local-request', route }, [channel.port2]);
    });
  }
  let closeStream: () => void = () => {};
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  let heartbeat: ReturnType<typeof setInterval>;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(heartbeat);
    event.request.signal.removeEventListener('abort', abort);
    channel.port1.close();
    finish();
  };
  const abort = () => {
    channel.port1.postMessage({ type: 'cancel' });
    try {
      if (!cancelled) closeStream();
    } finally {
      stop();
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      closeStream = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };
      const resetTimeout = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          channel.port1.postMessage({ type: 'cancel' });
          if (!closed)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'RUN_ERROR', message: 'Local inference tab stopped responding. Reload and load the model again.' })}\n\n`,
              ),
            );
          closeStream();
          stop();
        }, 45_000);
      };
      channel.port1.onmessage = ({ data }) => {
        resetTimeout();
        if (data.type === 'event' && !closed)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data.event)}\n\n`));
        if (data.type === 'done') {
          closeStream();
          stop();
        }
      };
      // Stream comments keep the HTTP channel active, not the inference model.
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': browser-local\n\n'));
      }, 10_000);
      resetTimeout();
      event.request.signal.addEventListener('abort', abort, { once: true });
      client.postMessage({ type: 'macroquest-local-request', route, input }, [channel.port2]);
    },
    cancel() {
      cancelled = true;
      abort();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  });
}
