/**
 * Tests for services/reference-time-prompt.
 */

import {
  buildReferenceTimePrompt,
  formatReferencePrompt,
  pickLatestSessionDate,
} from '../../../services/reference-time-prompt';
import type { NormalizedTimestamp } from '../../../services/memory/temporal-normalizer';

describe('reference-time-prompt', () => {
  // -------------------------------------------------------------------
  describe('buildReferenceTimePrompt', () => {
    it('builds a prompt for a LoCoMo-format date', () => {
      const p = buildReferenceTimePrompt('1:56 pm on 8 May, 2023');
      expect(p).toMatch(/2023-05-08T13:56:00/);
      expect(p).toMatch(/time-precision/);
      expect(p).toMatch(/relative phrases/);
    });

    it('builds a prompt for day-precision input', () => {
      const p = buildReferenceTimePrompt('8 May 2023');
      expect(p).toMatch(/2023-05-08/);
      expect(p).toMatch(/day-precision/);
    });

    it('returns empty string when input is empty', () => {
      expect(buildReferenceTimePrompt('')).toBe('');
    });

    it('returns empty string when input is unparseable', () => {
      expect(buildReferenceTimePrompt('banana')).toBe('');
    });
  });

  // -------------------------------------------------------------------
  describe('formatReferencePrompt', () => {
    it('formats from a NormalizedTimestamp directly', () => {
      const t: NormalizedTimestamp = {
        iso: '2024-01-04T00:19:00',
        precision: 'time',
        raw: '12:19 am on 4 January, 2024',
        confidence: 1.0,
        isRelative: false,
      };
      const p = formatReferencePrompt(t);
      expect(p).toContain('2024-01-04T00:19:00');
      expect(p).toContain('time-precision');
    });

    it('emits the right precision label across all four precisions', () => {
      for (const [precision, label] of [
        ['time', 'time-precision'],
        ['day', 'day-precision'],
        ['month', 'month-precision'],
        ['year', 'year-precision'],
      ] as const) {
        const t: NormalizedTimestamp = {
          iso: '2023',
          precision,
          raw: '2023',
          confidence: 1.0,
          isRelative: false,
        };
        expect(formatReferencePrompt(t)).toContain(label);
      }
    });
  });

  // -------------------------------------------------------------------
  describe('pickLatestSessionDate', () => {
    it('picks the highest-numbered session', () => {
      const conv = {
        speaker_a: 'A',
        speaker_b: 'B',
        session_1: [],
        session_1_date_time: '8 May 2023',
        session_2: [],
        session_2_date_time: '25 May 2023',
        session_5: [],
        session_5_date_time: '10 July 2023',
        session_3: [],
        session_3_date_time: '9 June 2023',
      };
      expect(pickLatestSessionDate(conv)).toBe('10 July 2023');
    });

    it('handles single-session conversation', () => {
      expect(
        pickLatestSessionDate({ session_1_date_time: '8 May 2023' }),
      ).toBe('8 May 2023');
    });

    it('returns empty string when no session_N_date_time keys present', () => {
      expect(pickLatestSessionDate({ unrelated: 'value' })).toBe('');
      expect(pickLatestSessionDate({})).toBe('');
    });

    it('numerical (not lexical) ordering: session_10 > session_9', () => {
      const conv = {
        session_9_date_time: 'september',
        session_10_date_time: 'october',
      };
      expect(pickLatestSessionDate(conv)).toBe('october');
    });

    it('coerces non-string values to string', () => {
      const conv = { session_1_date_time: 12345 };
      expect(pickLatestSessionDate(conv as Record<string, unknown>)).toBe('12345');
    });
  });

  // -------------------------------------------------------------------
  describe('integration: pick + build', () => {
    it('end-to-end conv-26-shaped input', () => {
      // Mirrors the structure of experiments/data/locomo.json for conv-26.
      const conv = {
        speaker_a: 'Caroline',
        speaker_b: 'Melanie',
        session_1: [],
        session_1_date_time: '1:56 pm on 8 May, 2023',
        session_2: [],
        session_2_date_time: '12:19 am on 4 January, 2024',
      };
      const latest = pickLatestSessionDate(conv);
      const prompt = buildReferenceTimePrompt(latest);
      expect(prompt).toContain('2024-01-04T00:19:00');
      expect(prompt).toContain('time-precision');
    });
  });
});
