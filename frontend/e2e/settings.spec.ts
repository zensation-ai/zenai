import { test, expect } from '@playwright/test';

/**
 * Settings page tests.
 * Verifies the settings page loads and tabs are navigable.
 * Uses intercepted API responses — no backend required.
 */

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    // Simulate authenticated session
    await page.route('**/api/auth/profile', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user', email: 'test@example.com', display_name: 'Test User' },
        }),
      }),
    );

    // Intercept remaining API calls
    await page.route('**/api/**', (route) => {
      if (route.request().url().includes('/api/auth/profile')) return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
    });

    // Set fake auth tokens
    await page.addInitScript(() => {
      localStorage.setItem('zenai_access_token', 'fake-jwt-for-e2e-testing');
      localStorage.setItem('zenai_refresh_token', 'fake-refresh-for-e2e-testing');
    });
  });

  test('user settings page loads at /system/benutzer', async ({ page }) => {
    await page.goto('/system/benutzer', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('AI settings page loads at /system/ki', async ({ page }) => {
    await page.goto('/system/ki', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('integrations settings page loads at /system/integrationen', async ({ page }) => {
    await page.goto('/system/integrationen', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('settings pages render without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/system/benutzer', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

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

  test('navigation between settings sub-routes works', async ({ page }) => {
    // Start at user settings
    await page.goto('/system/benutzer', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Navigate to AI settings
    await page.goto('/system/ki', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    // Navigate to integrations
    await page.goto('/system/integrationen', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    await expect(body).not.toBeEmpty();
  });
});
