import { test, expect } from '@playwright/test';

// Visual regression baselines — snapshot each main page at viewport 1280x720.
// Run with --update-snapshots to regenerate after intentional visual changes.
//
// Baselines are OS-specific (font rendering + antialiasing differs). We only
// commit darwin baselines; Linux CI skips these tests. To add Linux baselines,
// run this suite on Linux with --update-snapshots and commit the generated PNGs.
test.skip(
  process.platform !== 'darwin',
  'Visual baselines only exist for darwin. Run with --update-snapshots on Linux to add Linux baselines.',
);

const PAGES = [
  { label: 'hub', url: '/' },
  { label: 'ideen', url: '/ideen' },
  { label: 'planer', url: '/planer' },
  { label: 'inbox', url: '/inbox' },
  { label: 'wissensbasis', url: '/wissen' },
  { label: 'cockpit', url: '/cockpit' },
  { label: 'meine-ki', url: '/meine-ki' },
  { label: 'system', url: '/system/benutzer' },
];

for (const p of PAGES) {
  test(`${p.label} visual`, async ({ page }) => {
    await page.goto(p.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000); // let animations settle
    // Disable CSS animations/transitions for stable snapshots
    await page.addStyleTag({
      content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }',
    });
    await expect(page).toHaveScreenshot(`${p.label}.png`, {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
}
