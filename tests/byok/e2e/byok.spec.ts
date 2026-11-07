import { expect, test, type Page } from '@playwright/test';

async function openFixture(page: Page) {
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    // The page's Google Fonts stylesheet is the only expected remote request.
    if (
      url.protocol.startsWith('http') &&
      url.origin !== 'http://127.0.0.1:4305' &&
      !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)
    )
      remoteRequests.push(request.url());
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Connect' })).toBeDisabled();
  await expect(
    page.getByText('Not connected. Pick a provider and paste your API key.'),
  ).toBeVisible();
  // The radio input is visually hidden; its label is the click target.
  await page.locator('label.byok-option', { hasText: 'OpenRouter' }).click();
  await page.getByLabel('OpenRouter API key').fill('fixture-key');
  await page.getByRole('checkbox', { name: /I understand the key is sent only to/ }).check();
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('heading', { name: 'MacroQuest', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /via OpenRouter/ })).toBeVisible();
  return remoteRequests;
}

async function ask(page: Page, prompt: string) {
  const chat = page.locator('copilot-chat');
  await chat.locator('textarea').fill(prompt);
  await chat.locator('textarea').press('Enter');
}

test('static subpath deploy: connect, chat, meal analysis, frontend tools and A2UI', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const remote = await openFixture(page);
  await ask(page, 'Hello');
  await expect(page.getByText('Fixture reply: your prompts stayed in this tab.')).toBeVisible();

  // analyze_meal runs in the worker, then the model logs the draft through the frontend tool.
  await ask(page, 'I had a chicken bowl');
  await expect(page.getByRole('status').filter({ hasText: 'Analysis complete' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fixture chicken bowl/ })).toContainText(
    '400 kcal',
  );
  await expect(page.getByText('Fixture: add_meal_to_log finished.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Analysis complete' })).toBeVisible();

  // The agent's estimate lands as a draft: flagged, not counted, confirmable in the log.
  const bowl = page.getByRole('article').filter({ hasText: 'Fixture chicken bowl' });
  await expect(bowl).toContainText('Draft · not counted yet');
  await bowl.getByRole('button', { name: /Fixture chicken bowl/ }).click();
  await bowl.getByRole('button', { name: 'Confirm meal' }).click();
  await expect(bowl).not.toContainText('Draft');
  await expect(bowl.getByRole('button', { name: 'Confirm meal' })).toHaveCount(0);

  const dayLabel = page.locator('h2:has-text("Meal log")').locator('xpath=preceding-sibling::p[1]');
  const today = await dayLabel.textContent();
  await ask(page, 'Show the previous day');
  await expect(dayLabel).not.toHaveText(today!);
  await expect(page.getByText('Fixture: show_previous_day finished.')).toBeVisible();

  // Without a surface the Recommended meals area offers the suggestion action; a rendered
  // surface replaces it.
  const suggest = page.getByRole('button', { name: 'Suggest meals for the rest of today' });
  await expect(suggest).toBeVisible();
  await ask(page, 'Show me a card');
  await expect(page.locator('mq-surface')).toContainText('Fixture surface text');
  await expect(suggest).toBeHidden();
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
});

test('Open Generative UI sandbox renders model-authored content', async ({ page }) => {
  await openFixture(page);
  await ask(page, 'Show me a chart of my macros');
  const sandbox = page.frameLocator('[data-testid="open-generative-ui-final-sandbox"]').last();
  await expect(sandbox.getByRole('heading', { name: 'Fixture macro chart' })).toBeVisible();
  const toggle = sandbox.getByRole('button', { name: 'Show values' });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(sandbox.locator('#result')).toHaveText('Fixture values shown');
});

test('AG-UI stop cancels the active generation and permits the next run', async ({ page }) => {
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
    const response = await fetch('api/byok/copilotkit/agent/default/run', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
    const text = response.text();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stop = await fetch('api/byok/copilotkit/agent/default/stop/cancel-test', {
      method: 'POST',
    });
    return { text: await text, stop: await stop.json() };
  });
  expect(result.stop).toEqual({ stopped: true });
  expect(result.text).toContain('RUN_STARTED');
  expect(result.text).toContain('RUN_ERROR');
  expect(result.text).not.toContain('RUN_FINISHED');
  await ask(page, 'Hello again');
  await expect(page.getByText('Fixture reply: your prompts stayed in this tab.')).toBeVisible();
});

test('unsupported endpoints are rejected by the service worker rather than sent anywhere', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Connect/ })).toBeVisible();
  const result = await page.evaluate(async () => {
    const response = await fetch('api/byok/copilotkit/agent/missing/run', { method: 'POST' });
    return { status: response.status, body: await response.json() };
  });
  expect(result.status).toBe(404);
  expect(result.body.error).toContain('Unsupported');
});

test('disconnecting discards the worker and returns to the provider card', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Change provider' }).click();
  await expect(page.getByRole('heading', { name: /Connect/ })).toBeVisible();
  await expect(page.getByText('Disconnected. The key was discarded.')).toBeVisible();
});

test('aborting the SSE fetch cancels the run and releases the worker', async ({ page }) => {
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
    const response = await fetch('api/byok/copilotkit/agent/default/run', {
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
    const next = await fetch('api/byok/copilotkit/agent/default/run', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return await next.text();
  });
  expect(nextRun).toContain('your prompts stayed in this tab.');
  expect(nextRun).toContain('RUN_FINISHED');
});
