import { chromium } from '@playwright/test';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const appUrl = process.env.MACROQUEST_APP_URL ?? 'http://127.0.0.1:4302';
const outputDir = resolve('output/playwright');
const imagePath = resolve('tests/fixtures/wikimedia-sushi-platter.jpg');
const videoPath = join(outputDir, 'macroquest-local-llm-real-web-image.webm');
const screenshotPath = join(outputDir, 'macroquest-local-llm-real-web-image.png');
const runResponsePath = join(outputDir, 'macroquest-run-response.sse');
const runSummaryPath = join(outputDir, 'macroquest-run-summary.json');
const renderTimeoutMs = Number(process.env.MACROQUEST_RENDER_TIMEOUT_MS ?? 60_000);

const prompt = 'What am I eating here?';
const sandboxPrompt = 'Can you make this meal lighter?';

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  recordVideo: {
    dir: outputDir,
    size: { width: 1440, height: 960 },
  },
});

const page = await context.newPage();
page.setDefaultTimeout(60_000);

const logs = [];
const copilotEvents = [];
const runResponsePaths = [];
page.on('console', (message) => logs.push(`[browser:${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
page.on('request', (request) => {
  if (request.url().includes('/api/copilotkit')) {
    copilotEvents.push(`[request] ${request.method()} ${request.url()}`);
  }
});
page.on('response', (response) => {
  if (response.url().includes('/api/copilotkit')) {
    copilotEvents.push(`[response] ${response.status()} ${response.url()}`);
    response
      .text()
      .then((body) => {
        if (response.url().includes('/agent/default/run')) {
          const indexedRunResponsePath = join(
            dirname(runResponsePath),
            `macroquest-run-response-${runResponsePaths.length + 1}.sse`,
          );
          writeFileSync(indexedRunResponsePath, body);
          writeFileSync(runResponsePath, body);
          runResponsePaths.push(indexedRunResponsePath);
        }
        const compactBody = body.replace(/\s+/g, ' ').trim();
        copilotEvents.push(
          `[body] ${response.url()} length=${compactBody.length} head=${compactBody.slice(0, 2000)} tail=${compactBody.slice(-5000)}`,
        );
      })
      .catch((error) => {
        copilotEvents.push(`[body-error] ${response.url()} ${error.message}`);
      });
  }
});
page.on('requestfailed', (request) => {
  logs.push(`[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText}`);
});

console.log('Opening MacroQuest UI...');
await page.goto(appUrl, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'MacroQuest' }).waitFor();

const chat = page.locator('copilot-chat');
await chat.waitFor();

const chatButtons = chat.locator('button');
const attachMenuButton = chatButtons.first();
const sendButton = chatButtons.last();

await attachMenuButton.click();
const fileChooserPromise = page.waitForEvent('filechooser');
await page.getByRole('menuitem', { name: 'Add photos or files' }).click();
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles(imagePath);
console.log('Attached real web image fixture.');

const input = page.locator('copilot-chat textarea').first();

async function sendCopilotPrompt(message) {
  await input.fill(message);
  await sendButton.waitFor({ state: 'visible' });
  const requestSeen = page.waitForRequest(
    (request) => request.url().includes('/api/copilotkit') && request.method() === 'POST',
    { timeout: 15_000 },
  );
  await sendButton.click();
  await requestSeen;
}

async function findReadySandboxFrame(timeoutMs) {
  const sandboxIframes = page.locator('[data-testid="open-generative-ui-final-sandbox"]');
  await sandboxIframes.first().waitFor({ state: 'visible', timeout: timeoutMs });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const handles = await sandboxIframes.elementHandles();
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

  throw new Error('No interactive Open Generative UI sandbox frame was ready.');
}

await sendCopilotPrompt(prompt);
console.log('Sent prompt through CopilotKit chat.');
await page.waitForTimeout(1_000);

const baselineChatText =
  (await chat.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
const beforeApplyMealBoard =
  (await page.locator('.meal-board').textContent())?.replace(/\s+/g, ' ').trim() ?? '';

let workflowResult = 'timeout-after-a2ui-review';
let a2uiResult = 'timeout';
let sandboxResult = 'not-run';
try {
  await page.waitForFunction(
    (baseline) => {
      const chatText =
        document.querySelector('copilot-chat')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return (
        chatText.length > baseline.length + 80 &&
        /sushi|nigiri|maki|salmon|shrimp|tuna|rice|tamago|roe|calorie|protein|carb|fat|estimate/i.test(chatText)
      );
    },
    baselineChatText,
    { timeout: renderTimeoutMs },
  );
  workflowResult = 'assistant-response';
} catch (error) {
  workflowResult = `timeout-after-local-request: ${error.message}`;
}

try {
  await page.waitForFunction(
    () => {
      const toolSurface = document.querySelector('[data-testid="a2ui-tool-surface"]');
      const surface = document.querySelector(
        '[data-testid="a2ui-activity-surface-scroll"] cpk-a2ui-surface',
      );
      const text = surface?.textContent ?? '';
      return Boolean(
        !toolSurface &&
          surface &&
          Array.isArray(surface.operations) &&
          surface.operations.length >= 2 &&
          /sushi|seafood|calor|protein|carb|fat/i.test(text) &&
          /apply/i.test(text),
      );
    },
    undefined,
    { timeout: renderTimeoutMs },
  );
  a2uiResult = 'lit-activity-surface-rendered-from-model-a2ui-review';
} catch (error) {
  a2uiResult = `timeout: ${error.message}`;
}

const beforeApplyStillEmpty =
  (await page.locator('.meal-board').textContent())?.includes('No meal analyzed yet') ?? false;

if (!a2uiResult.startsWith('timeout')) {
  const applyButton = page
    .locator('[data-testid="a2ui-activity-surface-scroll"] cpk-a2ui-surface button')
    .filter({ hasText: /apply/i })
    .first();
  await applyButton.waitFor({ state: 'visible' });

  const applyRequestSeen = page.waitForRequest(
    (request) => request.url().includes('/api/copilotkit') && request.method() === 'POST',
    { timeout: 15_000 },
  );
  await applyButton.click();
  await applyRequestSeen;
  console.log('Clicked A2UI apply action.');

  try {
    await page.waitForFunction(
      () => {
        const mealBoard = document.querySelector('.meal-board');
        const text = mealBoard?.textContent ?? '';
        return !text.includes('No meal analyzed yet') && /sushi|nigiri|maki|salmon|shrimp|tuna|rice|tamago|roe/i.test(text);
      },
      undefined,
      { timeout: renderTimeoutMs },
    );
    workflowResult = `${workflowResult}+a2ui-apply+meal-draft`;
  } catch (error) {
    workflowResult = `${workflowResult}+a2ui-apply-timeout: ${error.message}`;
  }
}

if (workflowResult.includes('+meal-draft')) {
  await page.waitForTimeout(1_000);
  await sendCopilotPrompt(sandboxPrompt);
  console.log('Asked for a lighter generated sandbox swap.');

  try {
    const sandboxFrame = await findReadySandboxFrame(renderTimeoutMs);
    await sandboxFrame.getByTestId('macro-swap-lab').waitFor({ state: 'visible' });
    await sandboxFrame.getByRole('heading', { name: 'Macro Swap Lab' }).waitFor({
      state: 'visible',
    });
    await page.waitForTimeout(1_000);
    await sandboxFrame.getByTestId('apply-lighter-swap').click();
    await page.waitForFunction(
      () => {
        const mealBoard = document.querySelector('.meal-board');
        const text = mealBoard?.textContent ?? '';
        return (
          /Lighter macro swap/i.test(text) &&
          /Open Generative UI sandbox/i.test(text)
        );
      },
      undefined,
      { timeout: renderTimeoutMs },
    );
    const sandboxStatus = await sandboxFrame
      .evaluate(() => document.getElementById('swapStatus')?.textContent ?? '')
      .catch(() => '');
    sandboxResult = `open-generative-ui-sandbox-apply+signal-store:${sandboxStatus}`;
    workflowResult = `${workflowResult}+sandbox-apply`;
    console.log('Applied Open Generative UI sandbox swap.');
  } catch (error) {
    sandboxResult = `timeout: ${error.message}`;
  }
}

await page.waitForTimeout(2_000);
await page.screenshot({ path: screenshotPath, fullPage: true });

const state = await page.evaluate(() => {
  const mealBoard = document.querySelector('.meal-board')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const chatText = document.querySelector('copilot-chat')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const toolSurface = document.querySelector('[data-testid="a2ui-tool-surface"]');
  const a2uiSurface = document.querySelector(
    '[data-testid="a2ui-activity-surface-scroll"] cpk-a2ui-surface',
  );
  const sandboxFrames = document.querySelectorAll(
    '[data-testid="open-generative-ui-final-sandbox"]',
  );
  return {
    mealBoard,
    chatText,
    a2uiSurface: {
      exists: Boolean(a2uiSurface),
      tagName: a2uiSurface?.tagName ?? '',
      renderedByActivityRenderer: Boolean(a2uiSurface?.closest('[data-testid="a2ui-activity-surface-scroll"]')),
      toolRendererSurfaceExists: Boolean(toolSurface),
      operations: Array.isArray(a2uiSurface?.operations) ? a2uiSurface.operations.length : 0,
      text: a2uiSurface?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    },
    openGenerativeUI: {
      finalSandboxFrames: sandboxFrames.length,
    },
  };
});

state.beforeApplyMealBoard = beforeApplyMealBoard;
state.beforeApplyStillEmpty = beforeApplyStillEmpty;

const video = page.video();
await context.close();
await browser.close();

const rawVideoPath = await video?.path();
if (rawVideoPath && rawVideoPath !== videoPath) {
  renameSync(rawVideoPath, videoPath);
}

const summary = {
  workflowResult,
  a2uiResult,
  sandboxResult,
  imagePath,
  videoPath,
  screenshotPath,
  runResponsePath,
  runResponsePaths,
  state,
  copilotEvents,
  logs,
};

writeFileSync(runSummaryPath, JSON.stringify(summary, null, 2));

console.log(JSON.stringify({
  workflowResult,
  a2uiResult,
  sandboxResult,
  imagePath,
  videoPath,
  screenshotPath,
  runResponsePath,
  runSummaryPath,
  state,
  logs,
}, null, 2));
