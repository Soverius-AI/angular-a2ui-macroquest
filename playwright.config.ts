import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm run start:runtime',
      url: 'http://127.0.0.1:3210/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm run start:ui',
      url: 'http://127.0.0.1:4300',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
