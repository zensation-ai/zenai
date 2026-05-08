/**
 * Timeline Generator — compact ISO-sorted event blocks for "when" queries.
 *
 * For LoCoMo Cat 2 (Temporal) and any "when did X happen" / "in what
 * order did A, B, C occur" question, the agent benefits from an
 * already-sorted, date-tagged event timeline as a compact context
 * block — rather than a list of memory texts the model has to sort
 * itself.
 *
 * This module:
 *   1. Takes a list of memory records (any shape with extractable
 *      text + date_time field).
 *   2. Normalises the dates via `services/memory/temporal-normalizer`.
 *   3. Sorts ascending by ISO timestamp.
 *   4. Formats as a single compact string block ready for prompt
 *      injection.
 *
 * Phase H sprint reference: spec § H1 task 4.
 *
 * @module services/reasoning/timeline-generator
 */

import {
  normalizeTimestamp,
  compareTimestamps,
  type NormalizedTimestamp,
  type TemporalPrecision,
} from '../memory/temporal-normalizer';

// ===========================================================================
// Types
// ===========================================================================

/** Minimal shape the generator needs from each event. */
export interface RawTimelineEvent {
  /** Free-form date string OR ISO-8601. The normaliser handles both. */
  dateString: string;
  /** Short event description (1 line preferred). */
  text: string;
  /** Optional speaker / actor / source label. */
  speaker?: string;
  /** Optional fact id or memory id (for trace-back from the agent). */
  id?: string;
}

/** Parsed event with normalised timestamp. */
export interface ParsedTimelineEvent {
  raw: RawTimelineEvent;
  parsed: NormalizedTimestamp;
}

/** Output of the build step — both parsed list and rendered text. */
export interface Timeline {
  /** Events that parsed cleanly, sorted ascending by ISO. */
  events: ParsedTimelineEvent[];
  /** Events whose date string did not parse — included so the agent
   *  knows they exist and can request a manual look. */
  unparseable: RawTimelineEvent[];
  /** The rendered text block — drop into a system prompt or context
   *  block. */
  textBlock: string;
}

// ===========================================================================
// Build
// ===========================================================================

/**
 * Build a chronological timeline from an array of raw events.
 *
 * @param events       — raw events with `dateString` + `text`.
 * @param options      — formatting options.
 * @returns Timeline with `events` (parsed + sorted),
 *          `unparseable` (skipped events), `textBlock` (rendered).
 */
export function buildTimeline(
  events: RawTimelineEvent[],
  options: {
    /** Maximum events to render. Default: render all. */
    maxEvents?: number;
    /** Maximum text width per event — long descriptions are truncated. */
    maxTextLength?: number;
    /** Title to print above the timeline. Default: "Event timeline". */
    title?: string;
    /** Anchor for relative-form date strings (e.g. "yesterday"). */
    anchor?: Date | string;
  } = {},
): Timeline {
  const parsed: ParsedTimelineEvent[] = [];
  const unparseable: RawTimelineEvent[] = [];

  for (const e of events) {
    const norm = normalizeTimestamp(e.dateString, options.anchor ? { anchor: options.anchor } : {});
    if (norm) {
      parsed.push({ raw: e, parsed: norm });
    } else {
      unparseable.push(e);
    }
  }

  // Sort ascending by ISO truncated to lower precision (compareTimestamps
  // does the right thing across mixed precisions).
  parsed.sort((a, b) => compareTimestamps(a.parsed, b.parsed));

  const limit = options.maxEvents ?? parsed.length;
  const slice = parsed.slice(0, limit);
  const textBlock = renderTimeline(slice, {
    maxTextLength: options.maxTextLength ?? 120,
    title: options.title ?? 'Event timeline',
    truncated: parsed.length > limit ? parsed.length - limit : 0,
    unparseableCount: unparseable.length,
  });

  return { events: parsed, unparseable, textBlock };
}

// ===========================================================================
// Render
// ===========================================================================

function renderTimeline(
  events: ParsedTimelineEvent[],
  opts: {
    maxTextLength: number;
    title: string;
    truncated: number;
    unparseableCount: number;
  },
): string {
  if (events.length === 0) {
    if (opts.unparseableCount > 0) {
      return `${opts.title}: (${opts.unparseableCount} events with unparseable dates — none rendered)`;
    }
    return `${opts.title}: (empty)`;
  }
  const lines: string[] = [`${opts.title}:`];
  for (const e of events) {
    const tag = formatTag(e.parsed);
    const text = truncate(e.raw.text, opts.maxTextLength);
    const speaker = e.raw.speaker ? `${e.raw.speaker}: ` : '';
    lines.push(`  - [${tag}] ${speaker}${text}`);
  }
  if (opts.truncated > 0) {
    lines.push(`  (${opts.truncated} additional events not shown)`);
  }
  if (opts.unparseableCount > 0) {
    lines.push(`  (${opts.unparseableCount} events with unparseable dates omitted)`);
  }
  return lines.join('\n');
}

function formatTag(t: NormalizedTimestamp): string {
  // For 'time' precision, render the ISO directly (already compact).
  // For coarser precisions, tag with the precision so the agent knows
  // it's a year-only or month-only entry.
  switch (t.precision) {
    case 'time':
      return t.iso;
    case 'day':
      return t.iso;
    case 'month':
      return `${t.iso} (month-precision)`;
    case 'year':
      return `${t.iso} (year-precision)`;
  }
}

function truncate(s: string, maxLen: number): string {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

// ===========================================================================
// Convenience: bridge from "memories" with arbitrary metadata shapes
// ===========================================================================

/** Try to extract `dateString`, `text`, `speaker` from common memory shapes. */
export function memoryToRawEvent(m: Record<string, unknown>): RawTimelineEvent | null {
  const text = String(m.text ?? m.content ?? m.memory ?? '').trim();
  if (!text) return null;
  const meta = (m.metadata as Record<string, unknown> | undefined) ?? {};
  const dateString = String(
    m.date_string
      ?? m.date_time
      ?? meta.date_time
      ?? meta.timestamp
      ?? m.timestamp
      ?? '',
  ).trim();
  if (!dateString) return null;
  const speaker = String(m.speaker ?? meta.speaker ?? '').trim() || undefined;
  const id = m.id !== undefined ? String(m.id) : undefined;
  return { dateString, text, speaker, id };
}

/** Build a timeline directly from a memory list of varying shapes. */
export function buildTimelineFromMemories(
  memories: Array<Record<string, unknown>>,
  options: Parameters<typeof buildTimeline>[1] = {},
): Timeline {
  const events: RawTimelineEvent[] = [];
  for (const m of memories) {
    const e = memoryToRawEvent(m);
    if (e) events.push(e);
  }
  return buildTimeline(events, options);
}

// ===========================================================================
// Re-export for callers that want a single import surface
// ===========================================================================

export type { TemporalPrecision };
