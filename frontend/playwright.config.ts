import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * CI: Only Chromium, single worker, 1 retry, concise reporter
 * Local: All browsers, parallel, no retries, full HTML report
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 15_000,

  reporter: process.env.CI
    ? [['github'], ['list']]
    : [['html', { outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Short action timeout - fail fast instead of hanging
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },

  projects: process.env.CI
    ? [
        // CI: Only Chromium to keep runs fast and output small
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      ]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
        { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
      ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
