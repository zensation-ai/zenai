# E2E Tests with Playwright

## Setup

Before running E2E tests, you need to install Playwright browsers:

```bash
npx playwright install
```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests with UI
npm run test:e2e:ui

# Run tests in headed mode (visible browser)
npm run test:e2e:headed

# Run only Chromium tests
npm run test:e2e:chromium
```

## Test Structure

```
e2e/
├── app.spec.ts          # Main application tests
│   ├── App Tests        # Basic app loading
│   ├── Ideas Tests      # Idea management
│   ├── Navigation Tests # Page navigation
│   ├── Accessibility    # A11y checks
│   └── Performance      # Load time checks
└── README.md            # This file
```

## Configuration

See `playwright.config.ts` for:
- Browser configurations (Chrome, Firefox, Safari, Mobile)
- Test timeouts and retries
- Screenshot and video settings
- Web server startup

## CI/CD Integration

For CI environments, ensure:
1. `CI=true` environment variable is set
2. Playwright browsers are installed in CI

Example GitHub Actions step:
```yaml
- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
```

## Writing Tests

Tests follow the AAA pattern (Arrange, Act, Assert):

```typescript
test('should display the main heading', async ({ page }) => {
  // Arrange
  await page.goto('/');

  // Act
  const heading = page.locator('h1');

  // Assert
  await expect(heading).toContainText('Personal AI Brain');
});
```

## Debugging

```bash
# Debug mode with Playwright Inspector
npx playwright test --debug

# Show browser during tests
npx playwright test --headed

# Generate and view test report
npx playwright show-report
```
