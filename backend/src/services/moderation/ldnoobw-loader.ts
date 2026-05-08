/**
 * LDNOOBW loader — Tier-1 moderation dictionary.
 *
 * Reads the JSON snapshots produced by `scripts/moderation/build-ldnoobw.ts`
 * once per process and compiles a single RegExp per language + severity.
 * The compiled regex uses word-boundary-aware alternation so multi-word
 * patterns (e.g. "kill yourself") match without matching substrings of
 * unrelated words.
 *
 * Exports `matchLDNOOBW(content)` — returns the highest-severity hit across
 * both languages, or null if nothing matches. The function is synchronous
 * and allocation-free on the hot path (pre-compiled regex reused).
 */

import type { Entry, Severity } from './ldnoobw-types';
import deSnapshot from './ldnoobw-de.json';
import enSnapshot from './ldnoobw-en.json';

export type LdnoobwSeverity = Severity;

export interface LdnoobwHit {
  language: 'de' | 'en';
  severity: LdnoobwSeverity;
  pattern: string;
}

interface CompiledDictionary {
  language: 'de' | 'en';
  blockRegex: RegExp | null;
  softRegex: RegExp | null;
  blockPatterns: string[];
  softPatterns: string[];
}

function compile(entries: Entry[], language: 'de' | 'en'): CompiledDictionary {
  const block = entries.filter((e) => e.severity === 'block').map((e) => e.pattern);
  const soft = entries.filter((e) => e.severity === 'soft').map((e) => e.pattern);

  return {
    language,
    blockPatterns: block,
    softPatterns: soft,
    blockRegex: buildRegex(block),
    softRegex: buildRegex(soft),
  };
}

function buildRegex(patterns: string[]): RegExp | null {
  if (patterns.length === 0) return null;
  // Word boundaries around each alternative. Patterns are already lowercase.
  // We wrap each individually so multi-word patterns get a single boundary
  // on each side of the whole phrase rather than between every token.
  const joined = patterns.map((p) => `(?:${p})`).join('|');
  return new RegExp(`\\b(?:${joined})\\b`, 'i');
}

const DE = compile(
  (deSnapshot as { entries: Entry[] }).entries,
  'de',
);
const EN = compile(
  (enSnapshot as { entries: Entry[] }).entries,
  'en',
);

/**
 * Return the first block hit across both languages, or the first soft hit
 * if no block hit is present, or null if the content is clean.
 *
 * Block hits take precedence — Tier-1 must not miss a block because a
 * soft-severity word in the other language matched first.
 */
export function matchLDNOOBW(content: string): LdnoobwHit | null {
  const lower = content.toLowerCase();

  const blockDe = DE.blockRegex?.exec(lower);
  if (blockDe) {
    return { language: 'de', severity: 'block', pattern: blockDe[0] };
  }
  const blockEn = EN.blockRegex?.exec(lower);
  if (blockEn) {
    return { language: 'en', severity: 'block', pattern: blockEn[0] };
  }

  const softDe = DE.softRegex?.exec(lower);
  if (softDe) {
    return { language: 'de', severity: 'soft', pattern: softDe[0] };
  }
  const softEn = EN.softRegex?.exec(lower);
  if (softEn) {
    return { language: 'en', severity: 'soft', pattern: softEn[0] };
  }

  return null;
}

/** Stats for observability / tests — number of compiled patterns per bucket. */
export function ldnoobwStats(): {
  de: { block: number; soft: number };
  en: { block: number; soft: number };
} {
  return {
    de: { block: DE.blockPatterns.length, soft: DE.softPatterns.length },
    en: { block: EN.blockPatterns.length, soft: EN.softPatterns.length },
  };
}
