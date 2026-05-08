/**
 * Tests for services/tool-handlers/date-tools.
 *
 * Covers handler-level behaviour (the user-facing surface):
 *   - format_date_for_query: ok/error shape, anchor flow, precision tag.
 *   - compute_date_delta: signed seconds + days/months/years; mixed
 *     precisions; leap-year handling; negative deltas; error cases.
 *   - DATE_TOOLS array shape (registration prerequisites).
 */

import {
  handleFormatDateForQuery,
  handleComputeDateDelta,
  DATE_TOOLS,
  DATE_TOOL_HANDLERS,
  TOOL_FORMAT_DATE_FOR_QUERY,
  TOOL_COMPUTE_DATE_DELTA,
} from '../../../services/tool-handlers/date-tools';

describe('date-tools', () => {
  // -------------------------------------------------------------------
  describe('TOOL_DEFINITIONS', () => {
    it('exports both tool definitions in DATE_TOOLS', () => {
      expect(DATE_TOOLS).toHaveLength(2);
      const names = DATE_TOOLS.map((t) => t.name);
      expect(names).toContain('format_date_for_query');
      expect(names).toContain('compute_date_delta');
    });

    it('format_date_for_query has the right schema', () => {
      const schema = TOOL_FORMAT_DATE_FOR_QUERY.input_schema as {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(['input']);
      expect(schema.properties.input).toBeDefined();
      expect(schema.properties.anchor_iso).toBeDefined();
    });

    it('compute_date_delta has the right schema', () => {
      const schema = TOOL_COMPUTE_DATE_DELTA.input_schema as {
        required: string[];
      };
      expect(schema.required).toEqual(['from', 'to']);
    });

    it('DATE_TOOL_HANDLERS map has matching keys', () => {
      const handlerKeys = Object.keys(DATE_TOOL_HANDLERS).sort();
      const toolNames = DATE_TOOLS.map((t) => t.name).sort();
      expect(handlerKeys).toEqual(toolNames);
    });
  });

  // -------------------------------------------------------------------
  describe('handleFormatDateForQuery', () => {
    it('parses LoCoMo primary format', () => {
      const r = handleFormatDateForQuery({ input: '1:56 pm on 8 May, 2023' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.iso).toBe('2023-05-08T13:56:00');
        expect(r.precision).toBe('time');
        expect(r.is_relative).toBe(false);
        expect(r.confidence).toBe(1.0);
      }
    });

    it('parses US-ordering with ordinal', () => {
      const r = handleFormatDateForQuery({ input: 'May 8th 2023' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.iso).toBe('2023-05-08');
    });

    it('returns error for empty input', () => {
      const r = handleFormatDateForQuery({ input: '' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/non-empty/);
    });

    it('returns error for non-string input', () => {
      const r = handleFormatDateForQuery({ input: 42 as unknown as string });
      expect(r.ok).toBe(false);
    });

    it('returns error for unparseable input', () => {
      const r = handleFormatDateForQuery({ input: 'banana' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/could not parse/);
    });

    it('returns error for relative without anchor', () => {
      const r = handleFormatDateForQuery({ input: 'yesterday' });
      expect(r.ok).toBe(false);
    });

    it('resolves relative with anchor_iso', () => {
      const r = handleFormatDateForQuery({
        input: 'yesterday',
        anchor_iso: '2024-05-08',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.iso).toBe('2024-05-07');
        expect(r.is_relative).toBe(true);
        expect(r.anchor_iso).toBeDefined();
      }
    });

    it('ignores invalid anchor_iso', () => {
      const r = handleFormatDateForQuery({
        input: 'yesterday',
        anchor_iso: 'not a date',
      });
      // Falls through to "no anchor" path → unparseable.
      expect(r.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  describe('handleComputeDateDelta', () => {
    it('computes positive delta in days', () => {
      const r = handleComputeDateDelta({ from: '8 May 2023', to: '25 May 2023' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.days).toBe(17);
        expect(r.months).toBe(0);
        expect(r.years).toBe(0);
        expect(r.seconds).toBe(17 * 86400);
        expect(r.precision).toBe('day');
      }
    });

    it('handles 1-year delta with leap-year correctly', () => {
      // 2023→2024 spans 366 days (2024 is a leap year)
      const r = handleComputeDateDelta({ from: '8 May 2023', to: '8 May 2024' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.days).toBe(366);
        expect(r.months).toBe(12);
        expect(r.years).toBe(1);
      }
    });

    it('handles non-leap 1-year delta', () => {
      // 2022 → 2023 = 365 days (non-leap)
      const r = handleComputeDateDelta({ from: '8 May 2022', to: '8 May 2023' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.days).toBe(365);
    });

    it('handles time-precision delta', () => {
      const r = handleComputeDateDelta({
        from: '1:56 pm on 8 May, 2023',
        to: '7:55 pm on 9 June, 2023',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.precision).toBe('time');
        expect(r.days).toBe(32);
        // 32 days, 5 hours, 59 minutes ≈ 2786340 sec
        expect(r.seconds).toBeGreaterThan(2786000);
        expect(r.seconds).toBeLessThan(2787000);
      }
    });

    it('handles month-precision delta', () => {
      const r = handleComputeDateDelta({ from: 'May 2023', to: 'July 2023' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.months).toBe(2);
        expect(r.precision).toBe('month');
      }
    });

    it('handles year-only delta', () => {
      const r = handleComputeDateDelta({ from: '2022', to: '2025' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.years).toBe(3);
        expect(r.months).toBe(36);
        expect(r.precision).toBe('year');
      }
    });

    it('returns negative delta when to < from', () => {
      const r = handleComputeDateDelta({ from: '8 May 2023', to: '7 May 2023' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.days).toBe(-1);
        expect(r.seconds).toBe(-86400);
      }
    });

    it('returns error for unparseable from', () => {
      const r = handleComputeDateDelta({ from: 'banana', to: '2023' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/from/);
    });

    it('returns error for unparseable to', () => {
      const r = handleComputeDateDelta({ from: '2023', to: 'banana' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/to/);
    });

    it('returns error for empty inputs', () => {
      expect(handleComputeDateDelta({ from: '', to: '2023' }).ok).toBe(false);
      expect(handleComputeDateDelta({ from: '2023', to: '' }).ok).toBe(false);
    });

    it('uses lower precision in result', () => {
      // year + day → year (lower)
      const r = handleComputeDateDelta({ from: '2023', to: '8 May 2024' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.precision).toBe('year');
    });
  });

  // -------------------------------------------------------------------
  describe('handler-registry roundtrip', () => {
    it('DATE_TOOL_HANDLERS dispatches correctly', () => {
      const r = (DATE_TOOL_HANDLERS.format_date_for_query as
        (a: { input: unknown }) => { ok: boolean; iso?: string })({
        input: '8 May 2023',
      });
      expect(r.ok).toBe(true);
      expect(r.iso).toBe('2023-05-08');
    });
  });
});
