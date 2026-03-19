// scripts/css-token-audit.ts
/**
 * CSS Token Audit — finds usage of legacy tokens across all CSS files.
 * Run: npx tsx scripts/css-token-audit.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const LEGACY_TOKENS = [
  '--primary', '--primary-dark', '--primary-light', '--primary-lighter', '--primary-glow',
  '--petrol', '--petrol-light', '--petrol-lighter',
  '--warm-coral', '--warm-peach', '--warm-cream',
  '--background:', '--background-gradient',
  '--surface:', '--surface-solid', '--surface-light:',
  '--card-bg', '--hover-bg',
  '--text:', '--text-muted', '--text-secondary:',
  '--border:', '--border-light',
];

function findCssFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...findCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      results.push(full);
    }
  }
  return results;
}

const cssFiles = findCssFiles('frontend/src');
const report: Array<{ file: string; count: number; tokens: string[] }> = [];

for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const found: string[] = [];
  for (const token of LEGACY_TOKENS) {
    const regex = new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const matches = content.match(regex);
    if (matches) {
      found.push(`${token} (${matches.length}x)`);
    }
  }
  if (found.length > 0) {
    report.push({ file: path.relative(process.cwd(), file), count: found.length, tokens: found });
  }
}

report.sort((a, b) => b.count - a.count);

console.log(`\n=== CSS Token Audit ===`);
console.log(`Files with legacy tokens: ${report.length} / ${cssFiles.length}`);
console.log(`Total legacy token usages: ${report.reduce((sum, r) => sum + r.count, 0)}\n`);

for (const entry of report.slice(0, 20)) {
  console.log(`${entry.file} (${entry.count} usages)`);
  for (const t of entry.tokens) {
    console.log(`  ${t}`);
  }
}
