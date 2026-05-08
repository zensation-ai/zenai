import { test, expect } from '@playwright/test';

// Chat UI smoke tests that don't require a live backend session.
// Full end-to-end (send → SSE → response rendered) requires the fervent-elgamal
// backend running on a test port; that's a separate setup documented in the repo.

async function authenticate(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('zenai_access_token', 'test-token');
    localStorage.setItem('zenai_refresh_token', 'test-refresh');
    localStorage.setItem('zenai_user', JSON.stringify({ id: 'test-user', email: 'test@example.com', name: 'Test User' }));
  });
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'test-user', email: 'test@example.com', name: 'Test User' } }) }),
  );
}

test.describe('Chat UI Smoke', () => {
  test('send button is disabled when input is empty', async ({ page }) => {
    await authenticate(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const sendBtn = page.locator('button[aria-label="Nachricht senden"]').first();
    await expect(sendBtn).toBeVisible({ timeout: 5000 });
    await expect(sendBtn).toBeDisabled();
  });

  test('typing text enables the send button', async ({ page }) => {
    await authenticate(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const textarea = page.locator('textarea').first();
    const sendBtn = page.locator('button[aria-label="Nachricht senden"]').first();
    await expect(sendBtn).toBeDisabled();
    await textarea.fill('Hallo');
    await expect(sendBtn).not.toBeDisabled();
  });

  test('Shift+Enter inserts newline instead of submitting', async ({ page }) => {
    await authenticate(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const textarea = page.locator('textarea').first();
    await textarea.fill('Zeile 1');
    await textarea.press('Shift+Enter');
    await textarea.type('Zeile 2');
    const value = await textarea.inputValue();
    expect(value).toBe('Zeile 1\nZeile 2');
  });

  test('image-upload file input is not focus-reachable (aria-hidden-focus guard)', async ({ page }) => {
    await authenticate(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const tabIndex = await page.evaluate(() => {
      const el = document.querySelector('.image-upload-input-hidden') as HTMLElement | null;
      return el?.getAttribute('tabindex');
    });
    expect(tabIndex).toBe('-1');
  });
});
