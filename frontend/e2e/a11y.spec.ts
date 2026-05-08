import { test, expect } from '@playwright/test';

// Run axe-core (from CDN) against each main page. Fails on critical violations.
const PAGES = [
  { label: 'Hub', url: '/' },
  { label: 'Ideen', url: '/ideen' },
  { label: 'Planer', url: '/planer' },
  { label: 'Inbox', url: '/inbox' },
  { label: 'Wissensbasis', url: '/wissen' },
  { label: 'Cockpit', url: '/cockpit' },
  { label: 'MeineKI', url: '/meine-ki' },
  { label: 'System', url: '/system/benutzer' },
];

for (const p of PAGES) {
  test(`${p.label} has no critical a11y violations`, async ({ page }) => {
    await page.goto(p.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' });
    const results = await page.evaluate(async () => {
      // @ts-expect-error axe loaded from CDN
      return await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    });
    const critical = results.violations.filter((v: { impact: string }) => v.impact === 'critical');
    if (critical.length > 0) {
      console.log(`[${p.label}] Critical violations:`, JSON.stringify(critical.map((v: { id: string; help: string; nodes: unknown[] }) => ({ id: v.id, help: v.help, count: v.nodes.length })), null, 2));
    }
    expect(critical).toHaveLength(0);
  });
}
