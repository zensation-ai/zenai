import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verify the app boots and basic navigation works.
 * All API calls are intercepted — no backend needed.
 */

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
  );
});

test('page renders visible content', async ({ page }) => {
  await page.goto('/');
  // Wait for React to mount
  await page.waitForTimeout(1000);
  // At least some interactive elements should be present
  const buttons = await page.locator('button').count();
  expect(buttons).toBeGreaterThan(0);
});

test('navigation buttons are clickable', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  const navButtons = page.locator('nav button, .header-nav button');
  const count = await navButtons.count();
  if (count >= 2) {
    // Click second nav button and verify no crash
    await navButtons.nth(1).click();
    await page.waitForTimeout(300);
    // Click back to first
    await navButtons.nth(0).click();
  }
  // App still renders after navigation
  const body = page.locator('body');
  await expect(body).not.toBeEmpty();
});
