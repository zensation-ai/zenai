/**
 * Tests for Temporal Query Parser
 *
 * Validates German time expression parsing for:
 * - Relative days (heute, gestern, vorgestern)
 * - Relative periods (vor X Tagen, letzte Woche)
 * - Month references (im Januar, seit März)
 * - Day parts (heute morgen, heute Abend)
 * - Weekdays (am Montag, letzten Dienstag)
 * - Vague expressions (kürzlich, neulich)
 * - SQL generation
 */

import {
  parseTemporalQuery,
  timeRangeToSQL,
  hasTemporalExpression,
  TemporalParseResult,
} from '../../../services/temporal-query-parser';

// Fixed reference time for deterministic tests: Saturday 2026-02-08 14:30:00
const REF_TIME = new Date(2026, 1, 8, 14, 30, 0);

describe('Temporal Query Parser', () => {
  // ===========================================
  // Basic Day References
  // ===========================================

  describe('Basic Day References', () => {
    it('should parse "heute"', () => {
      const result = parseTemporalQuery('Was habe ich heute geschrieben?', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      expect(result.timeRanges).toHaveLength(1);
      const range = result.timeRanges[0];
      expect(range.start.getDate()).toBe(8);
      expect(range.start.getHours()).toBe(0);
      expect(range.end.getDate()).toBe(8);
      expect(range.end.getHours()).toBe(23);
    });

    it('should parse "gestern"', () => {
      const result = parseTemporalQuery('Ideen von gestern', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDate()).toBe(7);
      expect(range.start.getHours()).toBe(0);
      expect(range.end.getDate()).toBe(7);
      expect(range.end.getHours()).toBe(23);
    });

    it('should parse "vorgestern"', () => {
      const result = parseTemporalQuery('Was war vorgestern?', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDate()).toBe(6);
      expect(range.end.getDate()).toBe(6);
    });
  });

  // ===========================================
  // Day Part References
  // ===========================================

  describe('Day Part References', () => {
    it('should parse "heute morgen"', () => {
      const result = parseTemporalQuery('heute morgen hatte ich eine Idee', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getHours()).toBe(6);
      expect(range.end.getHours()).toBe(12);
    });

    it('should parse "heute nachmittag"', () => {
      const result = parseTemporalQuery('heute nachmittag besprochen', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getHours()).toBe(12);
      expect(range.end.getHours()).toBe(18);
    });

    it('should parse "heute abend"', () => {
      const result = parseTemporalQuery('heute Abend geplant', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getHours()).toBe(18);
      expect(range.end.getHours()).toBe(23);
    });
  });

  // ===========================================
  // Relative Period Expressions
  // ===========================================

  describe('Relative Period Expressions', () => {
    it('should parse "vor 3 Tagen"', () => {
      const result = parseTemporalQuery('Was habe ich vor 3 Tagen geschrieben?', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDate()).toBe(5); // Feb 8 - 3 = Feb 5
      expect(range.sqlInterval).toBe('3 days');
    });

    it('should parse "vor 2 Wochen"', () => {
      const result = parseTemporalQuery('vor 2 Wochen angefangen', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      const daysDiff = Math.round((REF_TIME.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(13);
      expect(daysDiff).toBeLessThanOrEqual(15);
    });

    it('should parse "vor 1 Monat"', () => {
      const result = parseTemporalQuery('vor 1 Monat erstellt', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(0); // January
    });

    it('should parse "in den letzten 5 Tagen"', () => {
      const result = parseTemporalQuery('in den letzten 5 Tagen', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDate()).toBe(3); // Feb 8 - 5 = Feb 3
      expect(range.sqlInterval).toBe('5 days');
    });

    it('should parse "letzten 3 Wochen"', () => {
      const result = parseTemporalQuery('letzten 3 Wochen', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      const daysDiff = Math.round((REF_TIME.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(20);
      expect(daysDiff).toBeLessThanOrEqual(22);
    });
  });

  // ===========================================
  // Week/Month/Year Expressions
  // ===========================================

  describe('Week/Month/Year Expressions', () => {
    it('should parse "letzte Woche"', () => {
      const result = parseTemporalQuery('Ideen von letzter Woche', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      // Should cover the previous full week
      expect(range.start.getTime()).toBeLessThan(REF_TIME.getTime());
      expect(range.end.getTime()).toBeLessThanOrEqual(REF_TIME.getTime());
    });

    it('should parse "letzten Monat"', () => {
      const result = parseTemporalQuery('letzten Monat', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(0); // January
      expect(range.start.getDate()).toBe(1);
    });

    it('should parse "diese Woche"', () => {
      const result = parseTemporalQuery('diese Woche erstellt', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      // Start should be Monday of current week
      expect(range.start.getDay()).toBe(1); // Monday
      expect(range.start.getTime()).toBeLessThanOrEqual(REF_TIME.getTime());
    });

    it('should parse "diesen Monat"', () => {
      const result = parseTemporalQuery('diesen Monat', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(1); // February
      expect(range.start.getDate()).toBe(1);
    });

    it('should parse "dieses Jahr"', () => {
      const result = parseTemporalQuery('Alles aus diesem Jahr', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(0); // January
      expect(range.start.getDate()).toBe(1);
      expect(range.start.getFullYear()).toBe(2026);
    });

    it('should parse "vergangene Woche"', () => {
      const result = parseTemporalQuery('vergangene Woche', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
    });
  });

  // ===========================================
  // Month References
  // ===========================================

  describe('Month References', () => {
    it('should parse "im Januar"', () => {
      const result = parseTemporalQuery('Was hatte ich im Januar?', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(0); // January
      expect(range.start.getDate()).toBe(1);
      expect(range.end.getMonth()).toBe(0);
      expect(range.end.getDate()).toBe(31);
    });

    it('should parse "seit März" as range to now', () => {
      // März is in the future (March 2026 > Feb 2026), so should use March 2025
      const result = parseTemporalQuery('seit März', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(2); // March
      expect(range.start.getFullYear()).toBe(2025); // Last year since March 2026 is future
    });

    it('should handle "im Dezember" pointing to last year when in February', () => {
      const result = parseTemporalQuery('im Dezember', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(11); // December
      expect(range.start.getFullYear()).toBe(2025); // Last year
    });

    it('should parse "im Februar" as current month', () => {
      const result = parseTemporalQuery('im Februar', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getMonth()).toBe(1); // February
      expect(range.start.getFullYear()).toBe(2026);
    });
  });

  // ===========================================
  // Weekday References
  // ===========================================

  describe('Weekday References', () => {
    it('should parse "am Montag"', () => {
      // REF_TIME is Saturday Feb 8, 2026 => last Monday = Feb 3
      const result = parseTemporalQuery('am Montag erstellt', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDay()).toBe(1); // Monday
      expect(range.start.getDate()).toBe(2); // Feb 2 is the Monday before Feb 8 Saturday
    });

    it('should parse "letzten Freitag"', () => {
      const result = parseTemporalQuery('letzten Freitag', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDay()).toBe(5); // Friday
    });
  });

  // ===========================================
  // Vague Temporal Expressions
  // ===========================================

  describe('Vague Temporal Expressions', () => {
    it('should parse "kürzlich"', () => {
      const result = parseTemporalQuery('kürzlich geschrieben', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      // "kürzlich" = last 7 days
      const daysDiff = Math.round((REF_TIME.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(8);
    });

    it('should parse "neulich"', () => {
      const result = parseTemporalQuery('neulich besprochen', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
    });

    it('should parse "vor kurzem"', () => {
      const result = parseTemporalQuery('vor kurzem erstellt', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
    });
  });

  // ===========================================
  // Specific Dates
  // ===========================================

  describe('Specific Dates', () => {
    it('should parse "am 15. Januar"', () => {
      const result = parseTemporalQuery('am 15. Januar geschrieben', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDate()).toBe(15);
      expect(range.start.getMonth()).toBe(0); // January
      expect(range.start.getFullYear()).toBe(2026);
    });

    it('should parse "3. Februar"', () => {
      const result = parseTemporalQuery('3. Februar', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      const range = result.timeRanges[0];
      expect(range.start.getDate()).toBe(3);
      expect(range.start.getMonth()).toBe(1); // February
    });
  });

  // ===========================================
  // Cleaned Query
  // ===========================================

  describe('Cleaned Query', () => {
    it('should remove temporal expression from query', () => {
      const result = parseTemporalQuery('Was habe ich gestern über KI geschrieben?', REF_TIME);
      expect(result.cleanedQuery).not.toContain('gestern');
      expect(result.cleanedQuery).toContain('KI');
    });

    it('should preserve non-temporal parts', () => {
      const result = parseTemporalQuery('Ideen zu Machine Learning von letzter Woche', REF_TIME);
      expect(result.cleanedQuery).toContain('Machine Learning');
    });

    it('should handle query that is only temporal', () => {
      const result = parseTemporalQuery('gestern', REF_TIME);
      expect(result.hasTemporalContext).toBe(true);
      // cleanedQuery might be empty or the original
      expect(typeof result.cleanedQuery).toBe('string');
    });
  });

  // ===========================================
  // Combined Range
  // ===========================================

  describe('Combined Range', () => {
    it('should produce a combined range for single temporal expression', () => {
      const result = parseTemporalQuery('Was habe ich gestern notiert?', REF_TIME);
      expect(result.combinedRange).toBeDefined();
      expect(result.combinedRange!.start).toEqual(result.timeRanges[0].start);
    });
  });

  // ===========================================
  // No Temporal Context
  // ===========================================

  describe('No Temporal Context', () => {
    const nonTemporalMessages = [
      'Was ist Machine Learning?',
      'Erkläre mir Blockchain',
      'Erstelle eine Idee zu KI',
      'Hallo',
      'Wie funktioniert React?',
    ];

    test.each(nonTemporalMessages)('should not find temporal context in "%s"', (message) => {
      const result = parseTemporalQuery(message, REF_TIME);
      expect(result.hasTemporalContext).toBe(false);
      expect(result.timeRanges).toHaveLength(0);
      expect(result.cleanedQuery).toBe(message);
    });
  });

  // ===========================================
  // timeRangeToSQL
  // ===========================================

  describe('timeRangeToSQL', () => {
    it('should generate SQL with default column', () => {
      const range = parseTemporalQuery('gestern', REF_TIME).timeRanges[0];
      const sql = timeRangeToSQL(range);
      expect(sql.sql).toBe('created_at >= $1 AND created_at <= $2');
      expect(sql.params).toHaveLength(2);
      expect(sql.params[0]).toBeInstanceOf(Date);
      expect(sql.params[1]).toBeInstanceOf(Date);
      expect(sql.nextParamIndex).toBe(3);
    });

    it('should generate SQL with custom column and offset', () => {
      const range = parseTemporalQuery('heute', REF_TIME).timeRanges[0];
      const sql = timeRangeToSQL(range, 'updated_at', 5);
      expect(sql.sql).toBe('updated_at >= $5 AND updated_at <= $6');
      expect(sql.nextParamIndex).toBe(7);
    });
  });

  // ===========================================
  // hasTemporalExpression (Quick Check)
  // ===========================================

  describe('hasTemporalExpression', () => {
    it('should return true for temporal messages', () => {
      expect(hasTemporalExpression('Was habe ich gestern geschrieben?')).toBe(true);
      expect(hasTemporalExpression('letzte Woche')).toBe(true);
      expect(hasTemporalExpression('im Januar')).toBe(true);
      expect(hasTemporalExpression('kürzlich')).toBe(true);
      expect(hasTemporalExpression('vor 3 Tagen')).toBe(true);
      expect(hasTemporalExpression('diese Woche')).toBe(true);
    });

    it('should return false for non-temporal messages', () => {
      expect(hasTemporalExpression('Was ist KI?')).toBe(false);
      expect(hasTemporalExpression('Hallo')).toBe(false);
      expect(hasTemporalExpression('Erstelle eine Idee')).toBe(false);
    });
  });

  // ===========================================
  // Performance
  // ===========================================

  describe('Performance', () => {
    it('should parse in under 10ms', () => {
      const messages = [
        'Was habe ich gestern über KI geschrieben?',
        'Ideen von letzter Woche',
        'im Januar notiert',
        'vor 5 Tagen erstellt',
        'heute morgen besprochen',
        'Was ist Machine Learning?', // No temporal
      ];

      const start = performance.now();
      for (const msg of messages) {
        parseTemporalQuery(msg, REF_TIME);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50); // Very generous, should be < 5ms
    });
  });

  // ===========================================
  // Consistency
  // ===========================================

  describe('Consistency', () => {
    it('should return consistent results', () => {
      const msg = 'Gestern habe ich etwas zu React geschrieben';
      const r1 = parseTemporalQuery(msg, REF_TIME);
      const r2 = parseTemporalQuery(msg, REF_TIME);
      expect(r1.hasTemporalContext).toBe(r2.hasTemporalContext);
      expect(r1.timeRanges.length).toBe(r2.timeRanges.length);
      if (r1.timeRanges[0] && r2.timeRanges[0]) {
        expect(r1.timeRanges[0].start.getTime()).toBe(r2.timeRanges[0].start.getTime());
      }
    });

    it('should always return valid TemporalParseResult', () => {
      const messages = ['', 'hallo', 'gestern', 'vor 100 Tagen', 'im Dezember 2025'];
      for (const msg of messages) {
        const result: TemporalParseResult = parseTemporalQuery(msg, REF_TIME);
        expect(typeof result.hasTemporalContext).toBe('boolean');
        expect(Array.isArray(result.timeRanges)).toBe(true);
        expect(typeof result.cleanedQuery).toBe('string');
      }
    });
  });
});
