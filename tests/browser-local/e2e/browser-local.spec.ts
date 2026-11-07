import { expect, test, type Page } from '@playwright/test';

async function openFixture(page: Page) {
  await page.addInitScript(() => {
    // Fixture worker does no GPU work. Exercise UI even on a headless GPU-less runner.
    if (!('gpu' in navigator)) Object.defineProperty(navigator, 'gpu', { value: {} });
  });
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:4305')
      remoteRequests.push(request.url());
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Load model locally' })).toBeDisabled();
  await expect(page.getByText('Ready to load. No model has been downloaded.')).toBeVisible();
  expect(remoteRequests).toEqual([]);
  await page.getByRole('checkbox', { name: /I accept the model license/ }).check();
  await page.getByRole('button', { name: 'Load model locally' }).click();
  await expect(page.getByRole('heading', { name: 'MacroQuest', exact: true })).toBeVisible();
  return remoteRequests;
}

async function ask(page: Page, prompt: string) {
  const chat = page.locator('copilot-chat');
  await chat.locator('textarea').fill(prompt);
  await chat.locator('textarea').press('Enter');
}

test('static subpath deploy: consent, local chat, A2UI apply and frontend goals tool', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const remote = await openFixture(page);
  await ask(page, 'Hello');
  await expect(page.getByText('Fixture reply: your prompts stayed local.')).toBeVisible();
  await ask(page, 'Analyze a chicken bowl');
  const surface = page.locator('cpk-a2ui-surface');
  await expect(surface).toContainText('Fixture chicken bowl');
  await surface.getByRole('button', { name: 'Apply found macros' }).click();
  await expect(page.getByRole('button', { name: /Meal draft Fixture chicken bowl/ })).toContainText(
    '400 kcal',
  );
  await ask(page, 'Set my daily goals to 2100 calories and 160g protein');
  await expect(
    page.getByText('Setting your daily goals: calories 2100 kcal, protein 160g.'),
  ).toBeVisible();
  await expect(page.getByText('1700 kcal left', { exact: true })).toBeVisible();
  await expect(page.getByText('120g left', { exact: true })).toBeVisible();
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
});

test('validated sandbox activity renders interactive model-authored content', async ({ page }) => {
  await openFixture(page);
  await ask(page, 'Show me a chart of my macros');
  const sandbox = page.frameLocator('[data-testid="open-generative-ui-final-sandbox"]').last();
  await expect(sandbox.getByRole('heading', { name: 'Fixture macro chart' })).toBeVisible();
  const toggle = sandbox.getByRole('button', { name: 'Show values' });
  await expect
    .poll(() => toggle.evaluate((button) => typeof (button as HTMLButtonElement).onclick))
    .toBe('function');
  // Exercise keyboard activation; the SDK asynchronously auto-resizes its iframe.
  await toggle.focus();
  await toggle.press('Enter');
  await expect(sandbox.locator('#result')).toHaveText('Fixture values shown');
  const networkBlocked = await sandbox.locator('body').evaluate(async () => {
    try {
      await fetch('https://example.com/exfiltrate');
      return false;
    } catch {
      return true;
    }
  });
  expect(networkBlocked).toBe(true);
});

test('AG-UI stop cancels the active local generation and permits the next run', async ({
  page,
}) => {
  await openFixture(page);
  const result = await page.evaluate(async () => {
    const input = {
      threadId: 'cancel-test',
      runId: 'cancel-run',
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
      messages: [{ id: 'user', role: 'user', content: 'slow response' }],
    };
    const response = await fetch('api/browser-local/copilotkit/agent/default/run', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
    const text = response.text();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stop = await fetch('api/browser-local/copilotkit/agent/default/stop/cancel-test', {
      method: 'POST',
    });
    return { text: await text, stop: await stop.json() };
  });
  expect(result.stop).toEqual({ stopped: true });
  expect(result.text).toContain('RUN_STARTED');
  expect(result.text).toContain('RUN_ERROR');
  expect(result.text).not.toContain('RUN_FINISHED');
  await ask(page, 'Hello again');
  await expect(page.getByText('Fixture reply: your prompts stayed local.')).toBeVisible();
});

test('unsupported endpoints are rejected by the service worker rather than sent to a backend', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Gemma 4 E2B, running locally' })).toBeVisible();
  const result = await page.evaluate(async () => {
    const response = await fetch('api/browser-local/copilotkit/agent/missing/run', {
      method: 'POST',
    });
    return { status: response.status, body: await response.json() };
  });
  expect(result.status).toBe(404);
  expect(result.body.error).toContain('Unsupported');
});

test('missing WebGPU is actionable and never requests a model or GPU worker', async ({ page }) => {
  const downloads: string[] = [];
  page.on('request', (request) => {
    if (/agent-worker|\.onnx|huggingface/.test(request.url())) downloads.push(request.url());
  });
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  await page.goto('./');
  await page.getByRole('checkbox', { name: /Allow slower WASM/ }).uncheck();
  await page.getByRole('checkbox', { name: /I accept the model license/ }).check();
  await page.getByRole('button', { name: 'Load model locally' }).click();
  await expect(page.getByRole('alert')).toContainText('WebGPU is unavailable');
  await expect(page.getByRole('button', { name: 'Load model locally' })).toBeEnabled();
  expect(downloads).toEqual([]);
});

test('aborting the SSE fetch cancels inference and releases the local GPU slot', async ({
  page,
}) => {
  await openFixture(page);
  const nextRun = await page.evaluate(async () => {
    const input = {
      threadId: 'abort-test',
      runId: 'abort-run',
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
      messages: [{ id: 'user', role: 'user', content: 'slow response' }],
    };
    const controller = new AbortController();
    const response = await fetch('api/browser-local/copilotkit/agent/default/run', {
      method: 'POST',
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    try {
      await reader.read();
    } catch {
      /* expected fetch abort */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    input.runId = 'after-abort';
    input.messages[0].content = 'Hello';
    const next = await fetch('api/browser-local/copilotkit/agent/default/run', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return await next.text();
  });
  expect(nextRun).toContain('your prompts stayed local.');
  expect(nextRun).toContain('RUN_FINISHED');
});
