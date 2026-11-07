import { expect, type APIRequestContext, type Page, test } from '@playwright/test';

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
  await expect(page.getByRole('heading', { name: 'Meal log' })).toBeVisible();
}

test('MacroQuest meal log updates trusted Angular state', async ({ page, request }) => {
  await expectRuntimeReady(request);
  const consoleErrors = collectConsoleErrors(page);

  await openMacroQuest(page);

  const oatmeal = page.getByRole('article').filter({ hasText: 'Oatmeal' });
  await expect(oatmeal).toContainText('368 kcal');
  await expect(oatmeal).toContainText('28g protein');
  await expect(oatmeal).toContainText('45g carbs');
  await expect(oatmeal).toContainText('8g fat');
  await expect(oatmeal).not.toContainText('confirmed');

  await oatmeal.getByRole('button', { name: /Oatmeal/ }).click();
  await expect(oatmeal.getByRole('heading', { name: 'Oatmeal' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Servings' })).toHaveCount(0);

  // Honey is the second item. Halving it drops 15 kcal and 4 g carbs.
  await oatmeal.getByRole('button', { name: 'Edit Honey' }).click();
  await page.getByRole('spinbutton', { name: 'Servings' }).fill('0.5');

  await expect(page.getByText('353 kcal', { exact: true })).toBeVisible();
  await expect(page.getByText('28g protein', { exact: true })).toBeVisible();
  await expect(page.getByText('41g carbs', { exact: true })).toBeVisible();

  // Oatmeal is a confirmed meal from the seeded log: edits count directly, nothing to confirm.
  await expect(page.getByRole('button', { name: 'Confirm meal' })).toHaveCount(0);
  await expect(oatmeal).toContainText('353 kcal');
  expect(consoleErrors).toEqual([]);
});
