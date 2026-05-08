/**
 * Date Tools — agent-callable temporal utilities.
 *
 * Two Claude tools backed by the `services/memory/temporal-normalizer`
 * module:
 *   - `format_date_for_query`: parse a free-form English date string
 *      into ISO-8601 + precision, with optional anchor for relative
 *      forms ("yesterday").
 *   - `compute_date_delta`: compute the delta (days / months / years
 *      and a signed seconds count) between two date strings.
 *
 * Why these tools matter for LoCoMo Cat 2 (Temporal)
 * --------------------------------------------------
 * LoCoMo Cat-2 questions ask things like "When did Caroline first
 * mention X?" or "How long ago was her 18th birthday?". Without an
 * agent-accessible date utility, the model relies entirely on its
 * own arithmetic — error-prone for relative→absolute conversion. By
 * exposing `compute_date_delta` and `format_date_for_query`, the
 * agent can off-load to deterministic code, matching what
 * Mem0 / EvoReasoner do and what spec § H1 task 3 calls for.
 *
 * @module services/tool-handlers/date-tools
 */

import {
  normalizeTimestamp,
  type NormalizedTimestamp,
  type TemporalPrecision,
} from '../memory/temporal-normalizer';
import type { ToolDefinition } from '../claude/tool-use';

// ===========================================================================
// Tool definitions
// ===========================================================================

export const TOOL_FORMAT_DATE_FOR_QUERY: ToolDefinition = {
  name: 'format_date_for_query',
  description:
    'Parses a free-form English date string (e.g. "1:56 pm on 8 May, 2023", ' +
    '"May 8th 2023", "8 May 2023", "yesterday") into a stable ISO-8601 string ' +
    'with a precision tag. Use this whenever you need to store a date with ' +
    'a memory or compare two dates. Pass `anchor_iso` (an ISO-8601 string) to ' +
    'resolve relative forms like "yesterday" or "last year" — without it, ' +
    'relative inputs return null.',
  input_schema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description:
          'The date string to parse, in any common English format.',
      },
      anchor_iso: {
        type: 'string',
        description:
          'Optional ISO-8601 anchor used for relative forms ("yesterday", ' +
          '"last year"). Should be an absolute date string the parser can ' +
          'understand, or a Date.toISOString() output. Leave empty when ' +
          'the input is already absolute.',
      },
    },
    required: ['input'],
  },
};

export const TOOL_COMPUTE_DATE_DELTA: ToolDefinition = {
  name: 'compute_date_delta',
  description:
    'Computes the delta between two date strings (any common English ' +
    'format, both must parse) and returns days, months, years, and a ' +
    'signed seconds count from `from` to `to`. Use this for questions ' +
    'like "how long ago was X" or "how many months between X and Y".',
  input_schema: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Start date string (any common English format).',
      },
      to: {
        type: 'string',
        description: 'End date string (any common English format).',
      },
    },
    required: ['from', 'to'],
  },
};

// ===========================================================================
// Handler implementations
// ===========================================================================

export interface FormatDateResult {
  ok: true;
  iso: string;
  precision: TemporalPrecision;
  is_relative: boolean;
  anchor_iso?: string;
  confidence: number;
}

export interface ToolErrorResult {
  ok: false;
  error: string;
}

export function handleFormatDateForQuery(args: {
  input: unknown;
  anchor_iso?: unknown;
}): FormatDateResult | ToolErrorResult {
  const input = typeof args.input === 'string' ? args.input : '';
  if (!input) {
    return { ok: false, error: 'input must be a non-empty string' };
  }
  const anchorIso = typeof args.anchor_iso === 'string' ? args.anchor_iso : undefined;
  let anchor: Date | undefined;
  if (anchorIso) {
    const d = new Date(anchorIso);
    if (!isNaN(d.getTime())) anchor = d;
  }
  const parsed = normalizeTimestamp(input, anchor ? { anchor } : {});
  if (!parsed) {
    return {
      ok: false,
      error: `could not parse ${JSON.stringify(input)} as a date`,
    };
  }
  const out: FormatDateResult = {
    ok: true,
    iso: parsed.iso,
    precision: parsed.precision,
    is_relative: parsed.isRelative,
    confidence: parsed.confidence,
  };
  if (parsed.anchorIso) out.anchor_iso = parsed.anchorIso;
  return out;
}

export interface DateDeltaResult {
  ok: true;
  from_iso: string;
  to_iso: string;
  days: number;
  months: number;
  years: number;
  /** Signed seconds from `from` to `to` (negative if `to` precedes `from`). */
  seconds: number;
  /** Lower of the two parses' precision — coarser → less reliable result. */
  precision: TemporalPrecision;
}

export function handleComputeDateDelta(args: {
  from: unknown;
  to: unknown;
}): DateDeltaResult | ToolErrorResult {
  const fromStr = typeof args.from === 'string' ? args.from : '';
  const toStr = typeof args.to === 'string' ? args.to : '';
  if (!fromStr || !toStr) {
    return { ok: false, error: 'both `from` and `to` must be non-empty strings' };
  }
  const from = normalizeTimestamp(fromStr);
  const to = normalizeTimestamp(toStr);
  if (!from) return { ok: false, error: `could not parse from=${JSON.stringify(fromStr)}` };
  if (!to) return { ok: false, error: `could not parse to=${JSON.stringify(toStr)}` };

  const fromMs = isoToMillis(from);
  const toMs = isoToMillis(to);
  if (fromMs === null || toMs === null) {
    return {
      ok: false,
      error: 'could not convert parsed timestamps to milliseconds (unexpected state)',
    };
  }
  const seconds = Math.round((toMs - fromMs) / 1000);
  const days = Math.round(seconds / 86_400);
  // Calendar months/years (approximate, but correct given precision).
  const fromY = parseInt(from.iso.slice(0, 4), 10);
  const toY = parseInt(to.iso.slice(0, 4), 10);
  const fromM = from.precision === 'year' ? 0 : parseInt(from.iso.slice(5, 7) || '1', 10) - 1;
  const toM = to.precision === 'year' ? 0 : parseInt(to.iso.slice(5, 7) || '1', 10) - 1;
  const totalMonths = (toY - fromY) * 12 + (toM - fromM);
  const years = Math.trunc(totalMonths / 12);

  const order: TemporalPrecision[] = ['year', 'month', 'day', 'time'];
  const lowerIdx = Math.min(order.indexOf(from.precision), order.indexOf(to.precision));
  const lowerPrecision = order[lowerIdx];

  return {
    ok: true,
    from_iso: from.iso,
    to_iso: to.iso,
    days,
    months: totalMonths,
    years,
    seconds,
    precision: lowerPrecision,
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

function isoToMillis(t: NormalizedTimestamp): number | null {
  // Pad iso to a full ISO-8601 zulu-style string for Date parsing.
  let s = t.iso;
  if (t.precision === 'year') s = `${s}-01-01T00:00:00`;
  else if (t.precision === 'month') s = `${s}-01T00:00:00`;
  else if (t.precision === 'day') s = `${s}T00:00:00`;
  // 'time' is already a full ISO local-time string; Date(...) treats it as local.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// ===========================================================================
// Registry export — for tool-handlers.ts main wiring
// ===========================================================================

export const DATE_TOOLS: readonly ToolDefinition[] = [
  TOOL_FORMAT_DATE_FOR_QUERY,
  TOOL_COMPUTE_DATE_DELTA,
] as const;

export const DATE_TOOL_HANDLERS = {
  format_date_for_query: handleFormatDateForQuery,
  compute_date_delta: handleComputeDateDelta,
} as const;
