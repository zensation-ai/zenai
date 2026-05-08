/**
 * Build LDNOOBW JSON artifacts for Tier-1 moderation.
 *
 * Reads `scripts/moderation/ldnoobw-sources/{de,en}.txt`, normalizes to
 * `{pattern, severity}[]`, writes deterministic output to
 * `backend/src/services/moderation/ldnoobw-{de,en}.json`.
 *
 * Deterministic: running twice against unchanged sources produces byte-
 * identical JSON (sorted by pattern, dedup, lowercased).
 *
 * Usage: pnpm --filter backend run build:ldnoobw
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

type Severity = 'block' | 'soft';

interface Entry {
  pattern: string;
  severity: Severity;
}

const ROOT = resolve(__dirname, '..', '..');
const SOURCE_DIR = resolve(ROOT, 'scripts', 'moderation', 'ldnoobw-sources');
const OUT_DIR = resolve(ROOT, 'backend', 'src', 'services', 'moderation');

function parseSource(raw: string): Entry[] {
  const entries = new Map<string, Severity>();
  const lines = raw.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIdx = line.lastIndexOf('|');
    if (separatorIdx === -1) {
      throw new Error(`Malformed entry (no '|' separator): "${rawLine}"`);
    }

    const pattern = line.slice(0, separatorIdx).trim().toLowerCase();
    const severityRaw = line.slice(separatorIdx + 1).trim().toLowerCase();

    if (!pattern) {
      throw new Error(`Empty pattern on line: "${rawLine}"`);
    }
    if (pattern.length < 2) {
      // Single-character entries are noise — skip (matches upstream LDNOOBW policy)
      continue;
    }
    if (severityRaw !== 'block' && severityRaw !== 'soft') {
      throw new Error(`Invalid severity "${severityRaw}" on line: "${rawLine}"`);
    }

    // Upgrade-only: if any occurrence of a pattern is 'block', the final entry stays 'block'.
    const existing = entries.get(pattern);
    const next = severityRaw as Severity;
    if (!existing || next === 'block') {
      entries.set(pattern, next);
    }
  }

  return Array.from(entries.entries())
    .map(([pattern, severity]) => ({ pattern, severity }))
    .sort((a, b) => a.pattern.localeCompare(b.pattern, 'en'));
}

function buildLanguage(lang: 'de' | 'en'): Entry[] {
  const sourcePath = resolve(SOURCE_DIR, `${lang}.txt`);
  const raw = readFileSync(sourcePath, 'utf-8');
  return parseSource(raw);
}

function writeJson(lang: 'de' | 'en', entries: Entry[]): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = resolve(OUT_DIR, `ldnoobw-${lang}.json`);
  const payload = {
    language: lang,
    generatedBy: 'scripts/moderation/build-ldnoobw.ts',
    count: entries.length,
    entries,
  };
  const json = JSON.stringify(payload, null, 2) + '\n';
  writeFileSync(outPath, json, 'utf-8');
  process.stdout.write(
    `wrote ${outPath} (${entries.length} entries, ${entries.filter((e) => e.severity === 'block').length} block)\n`,
  );
}

function main(): void {
  const de = buildLanguage('de');
  const en = buildLanguage('en');

  if (de.length === 0) throw new Error('No entries parsed from de.txt');
  if (en.length === 0) throw new Error('No entries parsed from en.txt');

  writeJson('de', de);
  writeJson('en', en);

  process.stdout.write('ldnoobw build ok\n');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`[build-ldnoobw] ${(err as Error).message}\n`);
    process.exit(1);
  }
}

export { parseSource, buildLanguage };
export type { Entry, Severity };
