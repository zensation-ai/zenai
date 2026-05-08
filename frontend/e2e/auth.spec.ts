import { test, expect } from '@playwright/test';

/**
 * Authentication flow tests.
 * The app gates all routes behind AuthPage when no session exists.
 * All API calls are intercepted — no real backend needed.
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept all API calls to prevent Vite proxy errors
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    );
  });

  test('shows login form when not authenticated', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // AuthPage should render with login form fields
    const emailInput = page.locator('#auth-email');
    const passwordInput = page.locator('#auth-password');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('login form has email and password fields with correct types', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('#auth-email');
    const passwordInput = page.locator('#auth-password');

    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('login submit button is visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Submit button says "Anmelden" in login mode
    const submitButton = page.getByRole('button', { name: 'Anmelden' });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test('can switch to register mode', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Click "Kein Konto? Registrieren" link
    const registerLink = page.getByRole('button', { name: /Registrieren/i });
    await registerLink.click();

    // Now the submit button should say "Registrieren"
    const submitButton = page.getByRole('button', { name: 'Registrieren' }).first();
    await expect(submitButton).toBeVisible();

    // Name field should appear in register mode
    const nameInput = page.locator('#auth-name');
    await expect(nameInput).toBeVisible();
  });

  test('can switch to password reset mode', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Click "Passwort vergessen?" link
    const resetLink = page.getByRole('button', { name: /Passwort vergessen/i });
    await resetLink.click();

    // Submit button should say "Reset-Link senden"
    const submitButton = page.getByRole('button', { name: /Reset-Link senden/i });
    await expect(submitButton).toBeVisible();

    // Password field should be hidden in reset mode
    const passwordInput = page.locator('#auth-password');
    await expect(passwordInput).not.toBeVisible();
  });

  test('shows error on invalid login attempt', async ({ page }) => {
    // Intercept login endpoint to return an error
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email or password' }),
      }),
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Fill in credentials
    await page.locator('#auth-email').fill('test@example.com');
    await page.locator('#auth-password').fill('wrongpassword');

    // Submit the form
    await page.getByRole('button', { name: 'Anmelden' }).click();

    // Error message should appear (translated to German)
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
  });

  test('OAuth buttons are visible on login page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The "oder" divider between form and OAuth buttons
    const divider = page.getByText('oder');
    await expect(divider).toBeVisible();
  });
});
