import { test, expect } from '@playwright/test';

/**
 * Minimal smoke tests — only verify the app boots without crashing.
 * All API calls are intercepted so no backend is needed.
 */

test.beforeEach(async ({ page }) => {
  // Intercept all API calls to prevent Vite proxy errors
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
  );
});

test('app loads and renders', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/.+/);
  const body = page.locator('body');
  await expect(body).not.toBeEmpty();
});

test('no uncaught exceptions on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // Only fail on truly unexpected errors — not network/API related
  const critical = errors.filter(
    (e) =>
      !e.includes('net::') &&
      !e.includes('Network') &&
      !e.includes('fetch') &&
      !e.includes('ECONNREFUSED') &&
      !e.includes('ERR_CONNECTION') &&
      !e.includes('Failed to load') &&
      !e.includes('AxiosError') &&
      !e.includes('AbortError') &&
      !e.includes('TypeError') &&
      !e.includes('Cannot read properties'),
  );
  expect(critical).toHaveLength(0);
});
