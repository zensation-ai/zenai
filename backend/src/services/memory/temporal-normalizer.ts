/**
 * Temporal Normalizer — ingest-side date parser.
 *
 * Parses free-form English timestamps (the LoCoMo `session_N_date_time`
 * format like `"1:56 pm on 8 May, 2023"`, `"7:55 pm on 9 June, 2023"`)
 * into ISO-8601 strings with precision tags. The output is stable,
 * comparable, and suitable for bi-temporal KG edges (`event_time` /
 * `ingest_time`).
 *
 * Why a new file (vs extending services/temporal-query-parser.ts):
 *   - temporal-query-parser.ts parses USER QUERIES (German,
 *     "letzte Woche") into time RANGES for retrieval filtering.
 *   - temporal-normalizer (this file) parses INGEST timestamps
 *     (English, "1:56 pm on 8 May, 2023") into ISO-8601 POINTS for
 *     storage on memory records and KG edges.
 *   Different language, different direction (range vs point), different
 *   caller. Same module would conflate concerns.
 *
 * Phase H sprint reference: spec § H1 task 1.
 *
 * Performance target: < 1 ms per parse (pure regex, no API calls).
 *
 * Coverage matrix (Phase-H smoke set, see `__tests__` companion):
 *   - "1:56 pm on 8 May, 2023"        → time   (LoCoMo primary)
 *   - "10:37 am on 27 June, 2023"     → time   (LoCoMo primary)
 *   - "8 May 2023" / "8 May, 2023"    → day    (date-only)
 *   - "May 8, 2023" / "May 8th, 2023" → day    (US ordering)
 *   - "May 2023"                      → month
 *   - "2022"                          → year
 *   - "yesterday" / "last year"       → relative (requires anchor)
 *
 * @module services/memory/temporal-normalizer
 */

/* eslint-disable security/detect-unsafe-regex */

// ===========================================================================
// Types
// ===========================================================================

export type TemporalPrecision = 'time' | 'day' | 'month' | 'year';

export interface NormalizedTimestamp {
  /** ISO-8601 string truncated to precision. Examples:
   *    'time'  → "2023-05-08T13:56:00"  (no zone — LoCoMo timestamps are tz-naive)
   *    'day'   → "2023-05-08"
   *    'month' → "2023-05"
   *    'year'  → "2023"
   */
  iso: string;
  /** How specific the parse is. Drives bi-temporal-edge interval semantics. */
  precision: TemporalPrecision;
  /** The original input string (for audit / error reporting). */
  raw: string;
  /** Parser confidence in [0, 1]. 1.0 = exact regex match; lower = fallback. */
  confidence: number;
  /** True if input was relative ("yesterday", "last year") — needs anchorIso. */
  isRelative: boolean;
  /** When isRelative=true, the absolute anchor used to resolve. */
  anchorIso?: string;
}

// ===========================================================================
// Month names (English; the format LoCoMo uses)
// ===========================================================================

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const MONTH_RE = Object.keys(ENGLISH_MONTHS).join('|');

// ===========================================================================
// Helpers
// ===========================================================================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildIso(
  year: number,
  month: number | null,
  day: number | null,
  hour: number | null,
  minute: number | null,
): { iso: string; precision: TemporalPrecision } {
  if (hour !== null && minute !== null && month !== null && day !== null) {
    return {
      iso: `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00`,
      precision: 'time',
    };
  }
  if (month !== null && day !== null) {
    return { iso: `${year}-${pad2(month)}-${pad2(day)}`, precision: 'day' };
  }
  if (month !== null) {
    return { iso: `${year}-${pad2(month)}`, precision: 'month' };
  }
  return { iso: String(year), precision: 'year' };
}

/** Convert a 12-h clock (am/pm) to 24-h. */
function to24h(hour: number, ampm: string | undefined): number {
  const h = hour % 12;
  return ampm && ampm.toLowerCase() === 'pm' ? h + 12 : h;
}

function parseMonth(name: string): number | null {
  const m = ENGLISH_MONTHS[name.toLowerCase()];
  return m ?? null;
}

function stripOrdinal(s: string): string {
  // "8th" → "8"; "21st" → "21"; "2nd" → "2"; "23rd" → "23"
  return s.replace(/^(\d+)(?:st|nd|rd|th)$/i, '$1');
}

// ===========================================================================
// Pattern definitions (ordered specific → general)
// ===========================================================================

interface ParseAttempt {
  name: string;
  pattern: RegExp;
  parse: (m: RegExpMatchArray) => NormalizedTimestamp | null;
}

const ATTEMPTS: ParseAttempt[] = [
  // ── 1. LoCoMo primary: "1:56 pm on 8 May, 2023" ─────────────────────
  {
    name: 'time-on-day-month-year',
    pattern: new RegExp(
      String.raw`^\s*(\d{1,2}):(\d{2})\s*(am|pm)\s+on\s+(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_RE}),?\s+(\d{4})\s*$`,
      'i',
    ),
    parse: (m) => {
      const [raw, hh, mm, ampm, day, month, year] = m;
      const monthN = parseMonth(month);
      if (monthN === null) return null;
      const hour24 = to24h(parseInt(hh, 10), ampm);
      const built = buildIso(
        parseInt(year, 10), monthN, parseInt(day, 10), hour24, parseInt(mm, 10),
      );
      return {
        iso: built.iso,
        precision: built.precision,
        raw,
        confidence: 1.0,
        isRelative: false,
      };
    },
  },

  // ── 2. "May 7th, 2023" / "May 7, 2023" (US ordering) ────────────────
  {
    name: 'month-day-year',
    pattern: new RegExp(
      String.raw`^\s*(${MONTH_RE})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s*$`,
      'i',
    ),
    parse: (m) => {
      const [raw, month, day, year] = m;
      const monthN = parseMonth(month);
      if (monthN === null) return null;
      const built = buildIso(parseInt(year, 10), monthN, parseInt(day, 10), null, null);
      return {
        iso: built.iso,
        precision: built.precision,
        raw,
        confidence: 1.0,
        isRelative: false,
      };
    },
  },

  // ── 3. "8 May 2023" / "8 May, 2023" (UK ordering, no time) ──────────
  {
    name: 'day-month-year',
    pattern: new RegExp(
      String.raw`^\s*(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_RE}),?\s+(\d{4})\s*$`,
      'i',
    ),
    parse: (m) => {
      const [raw, day, month, year] = m;
      const monthN = parseMonth(month);
      if (monthN === null) return null;
      const built = buildIso(parseInt(year, 10), monthN, parseInt(day, 10), null, null);
      return {
        iso: built.iso,
        precision: built.precision,
        raw,
        confidence: 1.0,
        isRelative: false,
      };
    },
  },

  // ── 4. "May 2023" ───────────────────────────────────────────────────
  {
    name: 'month-year',
    pattern: new RegExp(String.raw`^\s*(${MONTH_RE}),?\s+(\d{4})\s*$`, 'i'),
    parse: (m) => {
      const [raw, month, year] = m;
      const monthN = parseMonth(month);
      if (monthN === null) return null;
      const built = buildIso(parseInt(year, 10), monthN, null, null, null);
      return {
        iso: built.iso,
        precision: built.precision,
        raw,
        confidence: 1.0,
        isRelative: false,
      };
    },
  },

  // ── 5. ISO-ish "2023-05-08T13:56:00" / "2023-05-08" (already normalized) ─
  {
    name: 'iso-passthrough',
    pattern: /^\s*(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?)?)?\s*$/,
    parse: (m) => {
      const [raw, y, mo, d, hh, mm] = m;
      const year = parseInt(y, 10);
      const month = mo ? parseInt(mo, 10) : null;
      const day = d ? parseInt(d, 10) : null;
      const hour = hh ? parseInt(hh, 10) : null;
      const minute = mm ? parseInt(mm, 10) : null;
      const built = buildIso(year, month, day, hour, minute);
      return {
        iso: built.iso,
        precision: built.precision,
        raw,
        confidence: 1.0,
        isRelative: false,
      };
    },
  },

  // ── 6. "2023" (year only) ───────────────────────────────────────────
  {
    name: 'year-only',
    pattern: /^\s*(\d{4})\s*$/,
    parse: (m) => {
      const [raw, year] = m;
      return {
        iso: year,
        precision: 'year',
        raw,
        confidence: 0.9,
        isRelative: false,
      };
    },
  },
];

// ===========================================================================
// Relative resolution
// ===========================================================================

const RELATIVE_PATTERNS: Array<{
  pattern: RegExp;
  resolve: (anchor: Date) => { iso: string; precision: TemporalPrecision };
}> = [
  {
    pattern: /^\s*(?:today|now)\s*$/i,
    resolve: (a) => ({
      iso: `${a.getFullYear()}-${pad2(a.getMonth() + 1)}-${pad2(a.getDate())}`,
      precision: 'day',
    }),
  },
  {
    pattern: /^\s*yesterday\s*$/i,
    resolve: (a) => {
      const d = new Date(a);
      d.setDate(d.getDate() - 1);
      return {
        iso: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        precision: 'day',
      };
    },
  },
  {
    pattern: /^\s*last\s+year\s*$/i,
    resolve: (a) => ({ iso: String(a.getFullYear() - 1), precision: 'year' }),
  },
  {
    pattern: /^\s*next\s+year\s*$/i,
    resolve: (a) => ({ iso: String(a.getFullYear() + 1), precision: 'year' }),
  },
  {
    pattern: /^\s*last\s+month\s*$/i,
    resolve: (a) => {
      const d = new Date(a);
      d.setMonth(d.getMonth() - 1);
      return { iso: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, precision: 'month' };
    },
  },
];

// ===========================================================================
// Public API
// ===========================================================================

export interface NormalizeOptions {
  /** When given, relative expressions ("yesterday", "last year") resolve
   *  against this anchor. Without it, relative inputs return null.
   *  In LoCoMo ingest, anchor = the session's own date_time (already-parsed). */
  anchor?: Date | string;
}

/**
 * Parse a free-form English date string into a normalized timestamp.
 * Returns `null` if no pattern matches (caller can decide to fall back
 * to LLM extraction or chrono-node when added).
 */
export function normalizeTimestamp(
  input: string,
  options: NormalizeOptions = {},
): NormalizedTimestamp | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pre-clean: collapse internal whitespace, strip ordinal stand-alones if any.
  const cleaned = trimmed.replace(/\s+/g, ' ');

  // Try absolute patterns.
  for (const a of ATTEMPTS) {
    const m = cleaned.match(a.pattern);
    if (m) {
      const result = a.parse(m);
      if (result) return result;
    }
  }

  // Relative patterns require an anchor.
  if (options.anchor) {
    const anchor = options.anchor instanceof Date ? options.anchor : new Date(options.anchor);
    if (!isNaN(anchor.getTime())) {
      for (const r of RELATIVE_PATTERNS) {
        if (r.pattern.test(cleaned)) {
          const { iso, precision } = r.resolve(anchor);
          return {
            iso,
            precision,
            raw: trimmed,
            confidence: 0.85,
            isRelative: true,
            anchorIso: anchor.toISOString(),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Convenience: parse with required anchor; throws on failure. Use when
 * the caller knows a parse must succeed (e.g., a LoCoMo session timestamp
 * that the dataset guarantees is present and well-formed).
 */
export function normalizeTimestampStrict(
  input: string,
  options: NormalizeOptions = {},
): NormalizedTimestamp {
  const result = normalizeTimestamp(input, options);
  if (!result) {
    throw new Error(`temporal-normalizer: could not parse ${JSON.stringify(input)}`);
  }
  return result;
}

/**
 * Compare two normalized timestamps as POINTS (down to their lower precision).
 * Returns negative if a < b, zero if equal at lower precision, positive if a > b.
 * For range-style queries see `services/temporal-query-parser`.
 */
export function compareTimestamps(a: NormalizedTimestamp, b: NormalizedTimestamp): number {
  // Compare as ISO strings prefix-truncated to the lower precision.
  const order: TemporalPrecision[] = ['year', 'month', 'day', 'time'];
  const lower = order[Math.min(order.indexOf(a.precision), order.indexOf(b.precision))];
  const lengths: Record<TemporalPrecision, number> = {
    year: 4, month: 7, day: 10, time: 19,
  };
  const len = lengths[lower];
  return a.iso.slice(0, len).localeCompare(b.iso.slice(0, len));
}
