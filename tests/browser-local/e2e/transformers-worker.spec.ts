import { expect, test } from '@playwright/test';

test('real Transformers.js browser SDK and matching ORT assets load without any model weights', async ({
  page,
}) => {
  const remote: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:4305')
      remote.push(request.url());
  });
  await page.goto('./');
  const result = await page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const worker = new Worker(new URL('transformers-worker-probe.js', document.baseURI), {
          type: 'module',
        });
        const timer = setTimeout(() => {
          worker.terminate();
          resolve({ ok: false, error: 'Transformers.js import timed out' });
        }, 20_000);
        worker.onmessage = ({ data }) => {
          clearTimeout(timer);
          worker.terminate();
          resolve(data);
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          worker.terminate();
          resolve({ ok: false, error: event.message });
        };
        worker.postMessage({ wasmUrl: new URL('browser-local/ort/', document.baseURI).href });
      }),
  );
  expect(result).toEqual({
    ok: true,
    version: '4.3.2',
    model: 'onnx-community/gemma-4-E2B-it-ONNX',
    revision: '6f21c99d7e18237f8d2ce92aadfdbfeba877f63a',
    tokenizer: 'function',
    modelLoader: 'function',
    streamer: 'function',
    interruption: 'function',
    cache: false,
    threads: 1,
  });
  expect(remote).toEqual([]);
});
