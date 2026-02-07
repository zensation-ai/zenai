import { test, expect } from '@playwright/test';

/**
 * Core app tests. All API calls are intercepted so no backend is needed.
 */

test.beforeEach(async ({ page }) => {
  // Mock all API calls to prevent Vite proxy errors (no backend in CI)
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
  );
});

test.describe('App - Core', () => {
  test('loads with heading and input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Personal AI Brain');
    await expect(page.locator('textarea').first()).toBeVisible();
  });

  test('context switcher visible', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('[class*="context"], .context-switcher').first(),
    ).toBeVisible();
  });

  test('can type in input', async ({ page }) => {
    await page.goto('/');
    const ta = page.locator('textarea').first();
    await ta.fill('Testidee');
    await expect(ta).toHaveValue('Testidee');
  });

  test('submit button visible', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('button.submit-button, button:has-text("Strukturieren")'),
    ).toBeVisible();
  });

  test('no critical JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForTimeout(500);
    const critical = errors.filter(
      (e) =>
        !e.includes('net::') &&
        !e.includes('Network') &&
        !e.includes('fetch') &&
        !e.includes('ECONNREFUSED') &&
        !e.includes('ERR_CONNECTION') &&
        !e.includes('Failed to load') &&
        !e.includes('AxiosError'),
    );
    expect(critical).toHaveLength(0);
  });
});
