/**
 * Temporal Query Parser
 *
 * Parses German time expressions in user queries into concrete date ranges.
 * Enables time-filtered retrieval from RAG and Memory systems.
 *
 * Based on Mem 2.0's temporal reasoning and Mem0g research:
 * Users naturally express time in relative terms ("letzte Woche",
 * "gestern", "im Januar"). Without parsing these, the system can't
 * filter results by time, degrading relevance for temporal queries.
 *
 * Performance target: < 10ms (pure regex, no API calls)
 *
 * @module services/temporal-query-parser
 */

/* eslint-disable security/detect-unsafe-regex */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

/**
 * A parsed time range with start and end dates
 */
export interface TimeRange {
  start: Date;
  end: Date;
  /** Human-readable description of the parsed time range */
  label: string;
  /** The original text that was matched */
  matchedText: string;
  /** SQL-compatible interval string (e.g., "7 days") */
  sqlInterval?: string;
}

/**
 * Result of temporal parsing
 */
export interface TemporalParseResult {
  /** Whether any temporal expression was found */
  hasTemporalContext: boolean;
  /** Parsed time ranges (may be multiple) */
  timeRanges: TimeRange[];
  /** The query with temporal expressions removed (for cleaner semantic search) */
  cleanedQuery: string;
  /** Combined range covering all detected ranges */
  combinedRange?: TimeRange;
}

// ===========================================
// Month Names (German)
// ===========================================

const GERMAN_MONTHS: Record<string, number> = {
  'januar': 0, 'jan': 0,
  'februar': 1, 'feb': 1,
  'märz': 2, 'mär': 2, 'maerz': 2,
  'april': 3, 'apr': 3,
  'mai': 4,
  'juni': 5, 'jun': 5,
  'juli': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sep': 8, 'sept': 8,
  'oktober': 9, 'okt': 9,
  'november': 10, 'nov': 10,
  'dezember': 11, 'dez': 11,
};

const GERMAN_WEEKDAYS: Record<string, number> = {
  'montag': 1, 'mo': 1,
  'dienstag': 2, 'di': 2,
  'mittwoch': 3, 'mi': 3,
  'donnerstag': 4, 'do': 4,
  'freitag': 5, 'fr': 5,
  'samstag': 6, 'sa': 6,
  'sonntag': 0, 'so': 0,
};

// ===========================================
// Temporal Pattern Definitions
// ===========================================

interface TemporalPattern {
  pattern: RegExp;
  parse: (match: RegExpMatchArray, now: Date) => TimeRange | null;
}

/**
 * All temporal patterns, ordered from most specific to most general.
 * Each pattern returns a TimeRange or null if the match is invalid.
 */
const TEMPORAL_PATTERNS: TemporalPattern[] = [
  // === Specific dates ===

  // "am 15. Januar" / "15. Januar" / "am 15.01."
  {
    pattern: /\b(?:am\s+)?(\d{1,2})\.\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i,
    parse: (match, now) => {
      const day = parseInt(match[1]);
      const monthName = match[2].toLowerCase();
      const month = GERMAN_MONTHS[monthName];
      if (month === undefined) {return null;}
      const year = now.getFullYear();
      const start = new Date(year, month, day, 0, 0, 0);
      const end = new Date(year, month, day, 23, 59, 59);
      // If the date is in the future, assume last year
      if (start > now) {
        start.setFullYear(year - 1);
        end.setFullYear(year - 1);
      }
      return { start, end, label: `${day}. ${match[2]}`, matchedText: match[0] };
    },
  },

  // "am 15.01." or "am 15.01.2026"
  {
    pattern: /\b(?:am\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})?\b/i,
    parse: (match, now) => {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const year = match[3] ? parseInt(match[3]) : now.getFullYear();
      const start = new Date(year, month, day, 0, 0, 0);
      const end = new Date(year, month, day, 23, 59, 59);
      if (!match[3] && start > now) {
        start.setFullYear(year - 1);
        end.setFullYear(year - 1);
      }
      return { start, end, label: `${day}.${match[2]}.`, matchedText: match[0] };
    },
  },

  // === Relative day expressions ===

  // "heute morgen" / "heute früh" / "heute Nachmittag" / "heute Abend"
  {
    pattern: /\bheute\s+(morgen|früh|vormittag|nachmittag|abend|nacht)\b/i,
    parse: (match, now) => {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const part = match[1].toLowerCase();
      let startHour: number, endHour: number;
      switch (part) {
        case 'morgen': case 'früh': startHour = 6; endHour = 12; break;
        case 'vormittag': startHour = 8; endHour = 12; break;
        case 'nachmittag': startHour = 12; endHour = 18; break;
        case 'abend': startHour = 18; endHour = 23; break;
        case 'nacht': startHour = 22; endHour = 6; break;
        default: startHour = 0; endHour = 23;
      }
      const start = new Date(today); start.setHours(startHour);
      const end = new Date(today); end.setHours(endHour, 59, 59);
      return { start, end, label: `heute ${part}`, matchedText: match[0] };
    },
  },

  // "heute" (standalone)
  {
    pattern: /\bheute\b/i,
    parse: (_match, now) => {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      return { start, end, label: 'heute', matchedText: _match[0], sqlInterval: '1 day' };
    },
  },

  // "gestern"
  {
    pattern: /\bgestern\b/i,
    parse: (_match, now) => {
      const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
      return { start, end, label: 'gestern', matchedText: _match[0], sqlInterval: '2 days' };
    },
  },

  // "vorgestern"
  {
    pattern: /\bvorgestern\b/i,
    parse: (_match, now) => {
      const start = new Date(now); start.setDate(start.getDate() - 2); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setDate(end.getDate() - 2); end.setHours(23, 59, 59, 999);
      return { start, end, label: 'vorgestern', matchedText: _match[0], sqlInterval: '3 days' };
    },
  },

  // === Relative period expressions ===

  // "vor X Tagen/Wochen/Monaten/Stunden"
  {
    pattern: /\bvor\s+(\d+)\s+(stunden?|tage?n?|wochen?|monats?|monaten?|jahren?|jahr)\b/i,
    parse: (match, now) => {
      const amount = parseInt(match[1]);
      const rawUnit = match[2].toLowerCase();
      // Normalize: stunden→stund, tagen→tag, wochen→woch, monaten/monat/monats→monat, jahren/jahr→jahr
      const unit = rawUnit.replace(/e?n$/, '').replace(/s$/, '');
      const start = new Date(now);
      const end = new Date(now);
      switch (unit) {
        case 'stund':
          start.setHours(start.getHours() - amount);
          break;
        case 'tag':
          start.setDate(start.getDate() - amount);
          start.setHours(0, 0, 0, 0);
          end.setDate(end.getDate() - amount + 1);
          end.setHours(0, 0, 0, 0);
          break;
        case 'woch':
          start.setDate(start.getDate() - amount * 7);
          start.setHours(0, 0, 0, 0);
          break;
        case 'monat':
          start.setMonth(start.getMonth() - amount);
          start.setHours(0, 0, 0, 0);
          break;
        case 'jahr':
          start.setFullYear(start.getFullYear() - amount);
          start.setHours(0, 0, 0, 0);
          break;
      }
      return {
        start,
        end: unit === 'tag' ? end : now,
        label: `vor ${amount} ${match[2]}`,
        matchedText: match[0],
        sqlInterval: `${amount} ${unit === 'stund' ? 'hours' : unit === 'tag' ? 'days' : unit === 'woch' ? 'weeks' : unit === 'monat' ? 'months' : 'years'}`,
      };
    },
  },

  // "in den letzten X Tagen/Wochen/Monaten"
  {
    pattern: /\b(?:in\s+den\s+)?letzten\s+(\d+)\s+(tagen?|wochen?|monaten?|stunden?)\b/i,
    parse: (match, now) => {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase().replace(/e?n$/, '');
      const start = new Date(now);
      switch (unit) {
        case 'stund': start.setHours(start.getHours() - amount); break;
        case 'tag': start.setDate(start.getDate() - amount); break;
        case 'woch': start.setDate(start.getDate() - amount * 7); break;
        case 'monat': start.setMonth(start.getMonth() - amount); break;
      }
      start.setHours(0, 0, 0, 0);
      return {
        start,
        end: now,
        label: `letzten ${amount} ${match[2]}`,
        matchedText: match[0],
        sqlInterval: `${amount} ${unit === 'stund' ? 'hours' : unit === 'tag' ? 'days' : unit === 'woch' ? 'weeks' : 'months'}`,
      };
    },
  },

  // "letzte Woche" / "letzter Monat" / "letztes Jahr"
  {
    pattern: /\b(letzte[rnms]?|vergangene[rnms]?|vorige[rnms]?)\s+(woche|monat|jahr)\b/i,
    parse: (match, now) => {
      const unit = match[2].toLowerCase();
      const start = new Date(now);
      const end = new Date(now);
      switch (unit) {
        case 'woche': {
          // Find Monday of current week, then go back 7 days for last week's Monday
          const daysSinceMonday = (start.getDay() + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
          start.setDate(start.getDate() - daysSinceMonday - 7);
          start.setHours(0, 0, 0, 0);
          // End = Sunday of last week (start + 6 days)
          const sunday = new Date(start);
          sunday.setDate(start.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);
          return { start, end: sunday, label: `${match[1]} Woche`, matchedText: match[0], sqlInterval: '14 days' };
        }
        case 'monat':
          start.setMonth(start.getMonth() - 1, 1);
          start.setHours(0, 0, 0, 0);
          end.setDate(0); // Last day of previous month
          end.setHours(23, 59, 59, 999);
          return { start, end, label: `${match[1]} Monat`, matchedText: match[0], sqlInterval: '60 days' };
        case 'jahr':
          start.setFullYear(start.getFullYear() - 1, 0, 1);
          start.setHours(0, 0, 0, 0);
          end.setFullYear(end.getFullYear() - 1, 11, 31);
          end.setHours(23, 59, 59, 999);
          return { start, end, label: `${match[1]} Jahr`, matchedText: match[0], sqlInterval: '730 days' };
        default:
          return null;
      }
    },
  },

  // "diese Woche" / "dieser Monat" / "dieses Jahr"
  {
    pattern: /\b(diese[rnms]?)\s+(woche|monat|jahr)\b/i,
    parse: (match, now) => {
      const unit = match[2].toLowerCase();
      const start = new Date(now);
      switch (unit) {
        case 'woche':
          // Monday of current week
          start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
          start.setHours(0, 0, 0, 0);
          return { start, end: now, label: 'diese Woche', matchedText: match[0], sqlInterval: '7 days' };
        case 'monat':
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          return { start, end: now, label: 'dieser Monat', matchedText: match[0], sqlInterval: '31 days' };
        case 'jahr':
          start.setMonth(0, 1);
          start.setHours(0, 0, 0, 0);
          return { start, end: now, label: 'dieses Jahr', matchedText: match[0], sqlInterval: '366 days' };
        default:
          return null;
      }
    },
  },

  // === Month-based expressions ===

  // "im Januar" / "im Februar" / "seit März"
  {
    pattern: /\b(im|seit|bis|ab)\s+(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i,
    parse: (match, now) => {
      const preposition = match[1].toLowerCase();
      const monthName = match[2].toLowerCase();
      const month = GERMAN_MONTHS[monthName];
      if (month === undefined) {return null;}

      const year = now.getFullYear();

      if (preposition === 'im') {
        const start = new Date(year, month, 1, 0, 0, 0);
        const end = new Date(year, month + 1, 0, 23, 59, 59);
        // If the month is in the future, use last year
        if (start > now) {
          start.setFullYear(year - 1);
          end.setFullYear(year - 1);
        }
        return { start, end, label: `im ${match[2]}`, matchedText: match[0] };
      }

      if (preposition === 'seit' || preposition === 'ab') {
        const start = new Date(year, month, 1, 0, 0, 0);
        if (start > now) {start.setFullYear(year - 1);}
        return { start, end: now, label: `seit ${match[2]}`, matchedText: match[0] };
      }

      if (preposition === 'bis') {
        const start = new Date(year, 0, 1, 0, 0, 0);
        const end = new Date(year, month + 1, 0, 23, 59, 59);
        if (end > now) {end.setFullYear(year - 1);}
        return { start, end, label: `bis ${match[2]}`, matchedText: match[0] };
      }

      return null;
    },
  },

  // === Weekday expressions ===

  // "am Montag" / "letzten Dienstag"
  {
    pattern: /\b(?:am\s+|letzten?\s+)(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i,
    parse: (match, now) => {
      const dayName = match[1].toLowerCase();
      const targetDay = GERMAN_WEEKDAYS[dayName];
      if (targetDay === undefined) {return null;}

      const start = new Date(now);
      const currentDay = start.getDay();
      let diff = currentDay - targetDay;
      if (diff <= 0) {diff += 7;} // Go to last week's instance
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: `am ${match[1]}`, matchedText: match[0] };
    },
  },

  // === Vague temporal expressions ===

  // "kürzlich" / "neulich" / "vor kurzem"
  {
    pattern: /\b(kürzlich|neulich|vor\s+kurzem|unlängst)\b/i,
    parse: (_match, now) => {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end: now, label: 'kürzlich', matchedText: _match[0], sqlInterval: '7 days' };
    },
  },

  // "früher" / "damals" (broader range)
  {
    pattern: /\b(früher|damals|einmal)\b/i,
    parse: (_match, now) => {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      return { start, end: now, label: 'früher', matchedText: _match[0], sqlInterval: '180 days' };
    },
  },
];

// ===========================================
// Main Parser
// ===========================================

/**
 * Parse temporal expressions from a German query.
 *
 * @param query - The user's message
 * @param referenceTime - Reference time (defaults to now, useful for testing)
 * @returns Parsed temporal context with time ranges
 */
export function parseTemporalQuery(
  query: string,
  referenceTime?: Date
): TemporalParseResult {
  const now = referenceTime || new Date();
  const timeRanges: TimeRange[] = [];
  let cleanedQuery = query;

  for (const { pattern, parse } of TEMPORAL_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      const range = parse(match, now);
      if (range) {
        // Validate range
        if (range.start <= range.end) {
          timeRanges.push(range);
          // Remove the matched temporal expression from the query
          cleanedQuery = cleanedQuery.replace(match[0], '').replace(/\s+/g, ' ').trim();
        }
      }
    }
  }

  // Calculate combined range if multiple ranges found
  let combinedRange: TimeRange | undefined;
  if (timeRanges.length > 0) {
    const earliest = new Date(Math.min(...timeRanges.map(r => r.start.getTime())));
    const latest = new Date(Math.max(...timeRanges.map(r => r.end.getTime())));
    combinedRange = {
      start: earliest,
      end: latest,
      label: timeRanges.map(r => r.label).join(' + '),
      matchedText: timeRanges.map(r => r.matchedText).join(', '),
    };
  }

  if (timeRanges.length > 0) {
    logger.debug('Temporal query parsed', {
      query: query.substring(0, 80),
      rangesFound: timeRanges.length,
      ranges: timeRanges.map(r => ({
        label: r.label,
        start: r.start.toISOString(),
        end: r.end.toISOString(),
      })),
    });
  }

  return {
    hasTemporalContext: timeRanges.length > 0,
    timeRanges,
    cleanedQuery: cleanedQuery || query,
    combinedRange,
  };
}

/**
 * Convert a TimeRange to a PostgreSQL WHERE clause fragment.
 *
 * @param range - The time range
 * @param column - The column name (default: 'created_at')
 * @param paramOffset - Starting parameter index
 * @returns SQL fragment and parameter values
 */
export function timeRangeToSQL(
  range: TimeRange,
  column: string = 'created_at',
  paramOffset: number = 1
): { sql: string; params: Date[]; nextParamIndex: number } {
  return {
    sql: `${column} >= $${paramOffset} AND ${column} <= $${paramOffset + 1}`,
    params: [range.start, range.end],
    nextParamIndex: paramOffset + 2,
  };
}

/**
 * Quick check: does the message contain temporal expressions?
 * Faster than full parsing when you only need a boolean.
 */
export function hasTemporalExpression(query: string): boolean {
  const QUICK_TEMPORAL_CHECK = /\b(heute|gestern|vorgestern|letzte[rnms]?|vergangene|vorige|kürzlich|neulich|vor\s+\d+\s+\w+|im\s+(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)|diese[rms]?\s+(woche|monat|jahr)|seit\s+\w+)\b/i;
  return QUICK_TEMPORAL_CHECK.test(query);
}
