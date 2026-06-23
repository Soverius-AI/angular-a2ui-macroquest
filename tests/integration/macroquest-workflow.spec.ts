import { expect, type APIRequestContext, type Frame, type Page, test } from '@playwright/test';

async function expectRuntimeReady(request: APIRequestContext) {
  const runtimeHealth = await request.get('http://127.0.0.1:3210/health');
  expect(runtimeHealth.ok()).toBe(true);
  await expect(runtimeHealth.json()).resolves.toEqual(
    expect.objectContaining({
      ok: true,
      runtime: 'macroquest',
      modelBaseUrl: 'http://127.0.0.1:8080/v1',
      modelName: 'gemma-4-12b-it',
    }),
  );
}

function collectConsoleErrors(page: Page) {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  return consoleErrors;
}

async function openMacroQuest(page: Page) {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'MacroQuest' })).toBeVisible();
  await expect(
    page.getByRole('textbox', {
      name: 'Ask Gemma what this meal is...',
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '0% on track' })).toBeVisible();
}

async function askCopilot(page: Page, prompt: string) {
  const chat = page.locator('copilot-chat');
  const input = chat.locator('textarea').first();
  const sendButton = chat.locator('button').last();
  const requestSeen = page.waitForRequest(
    (request) => request.url().includes('/api/copilotkit') && request.method() === 'POST',
  );

  await input.fill(prompt);
  await sendButton.click();
  await requestSeen;
}

async function findReadySandboxFrame(page: Page): Promise<Frame> {
  const sandboxIframes = page.locator('[data-testid="open-generative-ui-final-sandbox"]');
  await sandboxIframes.first().waitFor({ state: 'visible' });

  const deadline = Date.now() + 10_000;
  let inspectedFrames = 0;
  while (Date.now() < deadline) {
    const handles = await sandboxIframes.elementHandles();
    inspectedFrames = handles.length;

    for (const handle of handles) {
      const frame = await handle.contentFrame();
      if (!frame) continue;

      const ready = await frame
        .evaluate(
          () =>
            typeof globalThis.applyLighterSwap === 'function' &&
            Boolean(document.getElementById('applySwap')),
        )
        .catch(() => false);
      if (ready) return frame;
    }

    await page.waitForTimeout(100);
  }

  throw new Error(`No generated Macro Swap Lab sandbox frame became interactive. Inspected ${inspectedFrames} frame(s).`);
}

test('MacroQuest sample meal workflow updates trusted Angular state', async ({ page, request }) => {
  await expectRuntimeReady(request);
  const consoleErrors = collectConsoleErrors(page);

  await openMacroQuest(page);

  await page.getByRole('button', { name: 'Analyze sample bowl' }).click();

  await expect(page.getByRole('heading', { name: 'Chicken avocado power bowl' })).toBeVisible();
  await expect(page.getByText('554 kcal')).toHaveCount(2);
  await expect(page.getByText('45g protein', { exact: true })).toBeVisible();
  await expect(page.getByText('draft', { exact: true })).toBeVisible();

  await page.getByRole('spinbutton', { name: 'Servings' }).nth(1).fill('0.5');

  await expect(page.getByText('446 kcal')).toHaveCount(2);
  await expect(page.getByText('43g protein', { exact: true })).toBeVisible();
  await expect(page.getByText('33g carbs', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Confirm meal' }).click();

  await expect(page.getByText('confirmed', { exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('CopilotKit generated sandbox UI can update the Signal Store', async ({ page, request }) => {
  await expectRuntimeReady(request);
  const consoleErrors = collectConsoleErrors(page);

  await openMacroQuest(page);
  await page.getByRole('button', { name: 'Analyze sample bowl' }).click();
  await expect(page.getByRole('heading', { name: 'Chicken avocado power bowl' })).toBeVisible();
  await expect(page.locator('.meal-board')).toContainText('554 kcal');

  await askCopilot(page, 'Can you make this meal lighter?');

  const sandbox = await findReadySandboxFrame(page);
  await expect(sandbox.getByTestId('macro-swap-lab')).toBeVisible();
  await expect(sandbox.getByRole('heading', { name: 'Macro Swap Lab' })).toBeVisible();
  await expect(sandbox.getByTestId('apply-lighter-swap')).toBeVisible();

  await sandbox.getByTestId('apply-lighter-swap').click();
  await expect
    .poll(() => sandbox.evaluate(() => document.getElementById('swapStatus')?.textContent ?? ''))
    .toContain('Updated MacroQuest');

  const mealBoard = page.locator('.meal-board');
  await expect(mealBoard.getByRole('heading', { name: 'Lighter macro swap' })).toBeVisible();
  await expect(mealBoard).toContainText('Open Generative UI sandbox');
  await expect(mealBoard).toContainText('399 kcal');
  await expect(mealBoard).toContainText('45g protein');
  await expect(mealBoard).toContainText('30g carbs');
  await expect(mealBoard).toContainText('12g fat');
  await expect(mealBoard.getByText('draft', { exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
