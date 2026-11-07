import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/byok/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4305/demo/', trace: 'retain-on-failure' },
  webServer: {
    command:
      'node scripts/build-byok.mjs --test-fixture && node scripts/serve-byok-test.mjs',
    url: 'http://127.0.0.1:4305/demo/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env['PLAYWRIGHT_CHANNEL'] },
    },
  ],
});
