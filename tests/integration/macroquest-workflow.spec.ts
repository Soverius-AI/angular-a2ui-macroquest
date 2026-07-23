import { expect, type APIRequestContext, type Frame, type Page, test } from '@playwright/test';

async function expectRuntimeReady(request: APIRequestContext) {
  const runtimeHealth = await request.get('http://127.0.0.1:3210/health');
  expect(runtimeHealth.ok()).toBe(true);
  await expect(runtimeHealth.json()).resolves.toEqual(
    expect.objectContaining({
      ok: true,
      runtime: 'macroquest',
      modelBaseUrl: 'http://127.0.0.1:8080/v1',
      modelName: 'gemma-4-26b-a4b-it-qat',
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
      name: 'Ask Gemma about a meal...',
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '0% on track' })).toBeVisible();
}

async function askCopilot(page: Page, prompt: string) {
  const chat = page.locator('copilot-chat');
  const input = chat.locator('textarea').first();
  // The last button overall is a suggestion chip — the send button is the
  // last non-suggestion control next to the textarea.
  const sendButton = chat.locator('button:not([data-testid="copilot-suggestion"])').last();
  const requestSeen = page.waitForRequest(
    (request) => request.url().includes('/api/copilotkit') && request.method() === 'POST',
  );

  await input.fill(prompt);
  await sendButton.click();
  await requestSeen;
}

const FINAL_SANDBOX = '[data-testid="open-generative-ui-final-sandbox"]';

/**
 * Waits for a sandbox iframe generated AFTER `countBefore` whose document
 * satisfies `isReady`. The runtime's InMemoryAgentRunner persists the chat
 * thread across page loads, so restored earlier widgets can already be on the
 * page — only newly appended sandboxes count.
 */
async function waitForNewSandboxFrame(
  page: Page,
  countBefore: number,
  isReady: (frame: Frame) => Promise<boolean>,
): Promise<Frame> {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const handles = await page.locator(FINAL_SANDBOX).elementHandles();

    for (const handle of handles.slice(countBefore)) {
      const frame = await handle.contentFrame();
      if (!frame) continue;
      if (await isReady(frame).catch(() => false)) return frame;
    }

    await page.waitForTimeout(250);
  }

  throw new Error('No newly generated sandbox frame became ready within 120s.');
}

const swapLabReady = (frame: Frame) =>
  frame.evaluate(() =>
    Boolean(
      document.getElementById('applySwap') &&
      typeof (
        globalThis as typeof globalThis & {
          applyLighterSwap?: unknown;
          updateSwapPreview?: unknown;
        }
      ).applyLighterSwap === 'function' &&
      typeof (
        globalThis as typeof globalThis & {
          updateSwapPreview?: unknown;
        }
      ).updateSwapPreview === 'function',
    ),
  );

// Both model-authored SVG charts must contain visible geometry. Merely
// rendering empty chart containers is the regression this check prevents.
const macroChartReady = (frame: Frame) =>
  frame.evaluate(() => {
    const chart = document.querySelector('[data-testid="macro-chart"]');
    const goalChart = chart?.querySelector('[data-testid="goal-progress-chart"]');
    const mealChart = chart?.querySelector('[data-testid="meal-contribution-chart"]');
    const svgs = [goalChart, mealChart].filter(
      (candidate): candidate is SVGElement => candidate instanceof SVGElement,
    );
    return Boolean(
      chart &&
      svgs.length === 2 &&
      svgs.every((svg) => {
        const bounds = svg.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.bottom <= document.documentElement.clientHeight &&
          Boolean(svg.querySelector('rect, circle, path, polyline, polygon'))
        );
      }) &&
      (goalChart?.querySelectorAll('rect, path').length ?? 0) >= 4 &&
      (mealChart?.querySelectorAll('circle, path').length ?? 0) >= 2,
    );
  });

test('MacroQuest sample meal workflow updates trusted Angular state', async ({ page, request }) => {
  await expectRuntimeReady(request);
  const consoleErrors = collectConsoleErrors(page);

  await openMacroQuest(page);

  await page.getByRole('button', { name: 'Analyze sample bowl' }).click();

  const draftCard = page.getByRole('button', { name: /Meal draft Chicken avocado power bowl/ });
  await expect(draftCard).toBeVisible();
  await expect(draftCard).toContainText('554 kcal · 45g protein · 55g carbs · 17g fat');
  await expect(draftCard).toContainText('draft');

  // The servings workbench lives in the modal behind the meal-draft card.
  await draftCard.click();
  await expect(page.getByRole('heading', { name: 'Chicken avocado power bowl' })).toBeVisible();

  await page.getByRole('spinbutton', { name: 'Servings' }).nth(1).fill('0.5');

  await expect(page.getByText('446 kcal', { exact: true })).toBeVisible();
  await expect(page.getByText('43g protein', { exact: true })).toBeVisible();
  await expect(page.getByText('33g carbs', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Confirm meal' }).click();

  await expect(draftCard).toContainText('confirmed');
  expect(consoleErrors).toEqual([]);
});

test('CopilotKit generated sandbox UI can update the Signal Store', async ({ page, request }) => {
  test.setTimeout(120_000);
  await expectRuntimeReady(request);
  const consoleErrors = collectConsoleErrors(page);

  await openMacroQuest(page);
  await page.getByRole('button', { name: 'Analyze sample bowl' }).click();
  const draftCard = page.getByRole('button', { name: /Meal draft Chicken avocado power bowl/ });
  await expect(draftCard).toContainText('554 kcal');

  const sandboxesBefore = await page.locator(FINAL_SANDBOX).count();
  await askCopilot(page, 'Can you make this meal lighter?');

  const sandbox = await waitForNewSandboxFrame(page, sandboxesBefore, swapLabReady);
  await expect(page.locator(FINAL_SANDBOX)).toHaveCount(sandboxesBefore + 1);
  await expect(sandbox.getByTestId('macro-swap-lab')).toBeVisible();
  await expect(sandbox.locator('body')).toContainText('MACRO SWAP LAB', {
    ignoreCase: true,
  });
  await expect(sandbox.getByTestId('apply-lighter-swap')).toBeVisible();
  await expect(sandbox.locator('body')).toContainText('554');
  await expect(sandbox.locator('body')).not.toContainText('--');

  await expect(sandbox.locator('#targetCalories')).toHaveText('554');
  await sandbox.locator('#calorieMultiplier').fill('0.7');
  await expect(sandbox.locator('#targetCalories')).toHaveText('388');

  // Reproduce a restored-chat edge case: the generated iframe still exists,
  // but the host no longer has a selected or latest meal. The model embeds the
  // source macros in its typed RPC payload, so Apply reconstructs and updates
  // the displayed meal instead of rejecting the action.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('heading', { name: '0% on track' })).toBeVisible();

  // The model-authored listener completes the sandbox-to-Angular RPC with one
  // click, without polling or repeated user actions.
  await sandbox.getByTestId('apply-lighter-swap').click();
  await expect(sandbox.locator('#swapStatus')).toContainText('Updated MacroQuest:');

  // The swap was applied in place: the workbench modal shows the
  // deterministic source line applyMacroSwap writes into the store.
  await page.getByRole('button', { name: /Meal draft/ }).click();
  await expect(page.getByText('Open Generative UI sandbox')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('CopilotKit macro chart renders a model-authored SVG dashboard', async ({ page, request }) => {
  test.setTimeout(240_000);
  await expectRuntimeReady(request);
  const consoleErrors = collectConsoleErrors(page);

  await openMacroQuest(page);
  await page.getByRole('button', { name: 'Analyze sample bowl' }).click();
  await expect(
    page.getByRole('button', { name: /Meal draft Chicken avocado power bowl/ }),
  ).toBeVisible();

  const sandboxesBefore = await page.locator(FINAL_SANDBOX).count();
  await askCopilot(page, 'Show me a chart of my macros vs my goals');

  const chart = await waitForNewSandboxFrame(page, sandboxesBefore, macroChartReady);
  await expect(page.locator(FINAL_SANDBOX)).toHaveCount(sandboxesBefore + 1);
  await expect(chart.getByTestId('macro-chart')).toBeVisible();
  await expect(chart.getByTestId('macro-kpis')).toBeVisible();
  await expect(chart.locator('svg')).toHaveCount(2);
  await expect(chart.locator('body')).toContainText('554');
  await expect(chart.locator('body')).not.toContainText('--');

  const absoluteToggle = chart.getByTestId('chart-toggle-absolute');
  const percentToggle = chart.getByTestId('chart-toggle-percent');
  await absoluteToggle.click();
  await expect
    .poll(async () => ({
      absoluteActive:
        (await absoluteToggle.getAttribute('aria-pressed')) === 'true' ||
        (await absoluteToggle.getAttribute('class'))?.split(/\s+/).includes('active'),
      percentActive:
        (await percentToggle.getAttribute('aria-pressed')) === 'true' ||
        (await percentToggle.getAttribute('class'))?.split(/\s+/).includes('active'),
    }))
    .toEqual({
      absoluteActive: true,
      percentActive: false,
    });

  expect(consoleErrors).toEqual([]);
});
