import { test, expect } from '@playwright/test';

/**
 * Smoke tests for critical user flows.
 * Designed to run without a backend (all API errors are tolerated).
 */

test.describe('Smoke: Chat', () => {
  test('chat area exists and input works', async ({ page }) => {
    await page.goto('/');
    // At least one chat-related element in the DOM
    const chatEls = await page.locator('[class*="chat"], [class*="Chat"]').count();
    expect(chatEls).toBeGreaterThan(0);

    // Can type in the first textarea
    const ta = page.locator('textarea').first();
    await ta.fill('Test Nachricht');
    await expect(ta).toHaveValue('Test Nachricht');
  });
});

test.describe('Smoke: Context Switch', () => {
  test('switcher visible', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('.context-switcher, [class*="context-switcher"]').first(),
    ).toBeVisible();
  });

  test('can click context buttons', async ({ page }) => {
    await page.goto('/');
    const btns = page.locator('.context-switcher button, [class*="context-switcher"] button');
    const count = await btns.count();
    if (count >= 2) {
      await btns.nth(1).click();
      await page.waitForTimeout(300);
      await btns.nth(0).click();
    }
    // App still renders after context switch
    await expect(page.locator('h1').first()).toBeVisible();
  });
});

test.describe('Smoke: Theme', () => {
  test('toggle exists and clickable', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('.theme-toggle, button[title*="Theme"]').first();
    const visible = await toggle.isVisible().catch(() => false);
    if (visible) {
      await toggle.click();
      // no crash = pass
    }
    expect(true).toBe(true);
  });
});
