/**
 * Reference-Time Prompt Builder — give the agent a "today" anchor.
 *
 * In a long LoCoMo conversation spanning months, "today" / "now" /
 * "this year" are ambiguous unless the agent knows the conversation's
 * own present-time. This module builds a short system-prompt fragment
 * that pins that anchor explicitly:
 *
 *     Reference time for this conversation: 2023-09-12 (day-precision).
 *     When questions use relative phrases like "today", "yesterday",
 *     "last year", or "two months ago", interpret them against this
 *     anchor.
 *
 * The anchor is normally the latest session's `date_time` from the
 * raw LoCoMo entry — see how the per-conversation runner picks it up.
 *
 * Phase H sprint reference: spec § H1 task 5.
 *
 * @module services/reference-time-prompt
 */

import {
  normalizeTimestamp,
  type NormalizedTimestamp,
  type TemporalPrecision,
} from './memory/temporal-normalizer';

const PRECISION_LABEL: Record<TemporalPrecision, string> = {
  time: 'time-precision',
  day: 'day-precision',
  month: 'month-precision',
  year: 'year-precision',
};

/**
 * Build a system-prompt fragment that anchors "today" / "now" for the
 * conversation. Returns an empty string when no parseable anchor was
 * given, so callers can safely concatenate without a defensive null
 * check.
 */
export function buildReferenceTimePrompt(latestSessionDateString: string): string {
  if (!latestSessionDateString) return '';
  const norm = normalizeTimestamp(latestSessionDateString);
  if (!norm) return '';
  return formatReferencePrompt(norm);
}

/**
 * Variant for callers that already have a parsed timestamp (avoids
 * re-parsing on the hot path).
 */
export function formatReferencePrompt(t: NormalizedTimestamp): string {
  const label = PRECISION_LABEL[t.precision];
  return [
    `Reference time for this conversation: ${t.iso} (${label}).`,
    'When questions use relative phrases like "today", "yesterday", "last',
    'year", or "two months ago", interpret them against this anchor.',
  ].join(' ');
}

/**
 * Pick the latest session's date_time from a LoCoMo `conversation`
 * object (keys `session_N` plus `session_N_date_time`). Returns the
 * raw string so the caller can decide whether to feed it through
 * `buildReferenceTimePrompt` or pin a different anchor.
 */
export function pickLatestSessionDate(conversation: Record<string, unknown>): string {
  const dateTimeKeys = Object.keys(conversation).filter((k) =>
    /^session_\d+_date_time$/.test(k),
  );
  if (dateTimeKeys.length === 0) return '';
  const sorted = dateTimeKeys.sort((a, b) => {
    const ai = parseInt(a.split('_')[1], 10);
    const bi = parseInt(b.split('_')[1], 10);
    return bi - ai; // descending — latest first
  });
  return String(conversation[sorted[0]] ?? '');
}
