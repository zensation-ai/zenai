/**
 * Tests for services/reasoning/timeline-generator.
 *
 * Covers:
 *   - sort order across mixed precisions (year/month/day/time)
 *   - unparseable events reported, not dropped silently
 *   - empty / single-event boundary cases
 *   - text-block rendering shape
 *   - buildTimelineFromMemories with varying memory shapes
 */

import {
  buildTimeline,
  buildTimelineFromMemories,
  memoryToRawEvent,
} from '../../../services/reasoning/timeline-generator';

describe('timeline-generator', () => {
  // -------------------------------------------------------------------
  describe('buildTimeline — sort order', () => {
    it('sorts ascending by ISO timestamp', () => {
      const tl = buildTimeline([
        { dateString: '25 May 2023', text: 'C' },
        { dateString: '1 June 2023', text: 'D' },
        { dateString: '1:56 pm on 8 May, 2023', text: 'A' },
        { dateString: '15 May 2023', text: 'B' },
      ]);
      expect(tl.events.map((e) => e.raw.text)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('handles mixed precisions via lower-precision truncation', () => {
      const tl = buildTimeline([
        { dateString: '2024', text: 'year-2024' },
        { dateString: 'May 2023', text: 'month-may' },
        { dateString: '8 May 2023', text: 'day-may-8' },
        { dateString: '9 May 2023', text: 'day-may-9' },
      ]);
      const order = tl.events.map((e) => e.raw.text);
      // Expected: month-may + day-may-8 + day-may-9 all have same year (2023);
      // 2024 is later. Within 2023, sort by lower precision truncation.
      expect(order[order.length - 1]).toBe('year-2024');
      expect(order.indexOf('day-may-8')).toBeLessThan(order.indexOf('day-may-9'));
    });

    it('reports unparseable events without dropping silently', () => {
      const tl = buildTimeline([
        { dateString: '8 May 2023', text: 'good' },
        { dateString: 'banana', text: 'bad' },
        { dateString: 'kiwi', text: 'also bad' },
      ]);
      expect(tl.events).toHaveLength(1);
      expect(tl.unparseable).toHaveLength(2);
      expect(tl.textBlock).toMatch(/2 events with unparseable dates omitted/);
    });
  });

  // -------------------------------------------------------------------
  describe('buildTimeline — boundary cases', () => {
    it('handles empty input', () => {
      const tl = buildTimeline([]);
      expect(tl.events).toHaveLength(0);
      expect(tl.textBlock).toMatch(/empty/);
    });

    it('handles only-unparseable input', () => {
      const tl = buildTimeline([{ dateString: 'banana', text: 'X' }]);
      expect(tl.events).toHaveLength(0);
      expect(tl.unparseable).toHaveLength(1);
      expect(tl.textBlock).toMatch(/unparseable/);
    });

    it('honours maxEvents truncation', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        dateString: `${i + 1} May 2023`,
        text: `event-${i}`,
      }));
      const tl = buildTimeline(events, { maxEvents: 3 });
      expect(tl.events).toHaveLength(10); // events array is the parsed pool, not the rendered slice
      // textBlock contains 3 events + a "(N additional events not shown)" note
      const eventLines = tl.textBlock.split('\n').filter((l) => l.trim().startsWith('-'));
      expect(eventLines).toHaveLength(3);
      expect(tl.textBlock).toMatch(/7 additional events not shown/);
    });

    it('truncates over-long event text', () => {
      const longText = 'lorem '.repeat(100);
      const tl = buildTimeline([{ dateString: '8 May 2023', text: longText }], {
        maxTextLength: 30,
      });
      const eventLine = tl.textBlock.split('\n').find((l) => l.includes('lorem'))!;
      // Includes the ellipsis we add.
      expect(eventLine).toMatch(/…/);
    });

    it('respects custom title', () => {
      const tl = buildTimeline([{ dateString: '8 May 2023', text: 'X' }], {
        title: 'Custom heading',
      });
      expect(tl.textBlock).toMatch(/^Custom heading:/);
    });
  });

  // -------------------------------------------------------------------
  describe('text-block format', () => {
    it('uses precision tags for coarser entries', () => {
      const tl = buildTimeline([
        { dateString: 'May 2023', text: 'month entry' },
        { dateString: '2022', text: 'year entry' },
        { dateString: '8 May 2023', text: 'day entry' },
        { dateString: '1:56 pm on 8 May, 2023', text: 'time entry' },
      ]);
      expect(tl.textBlock).toMatch(/month-precision/);
      expect(tl.textBlock).toMatch(/year-precision/);
    });

    it('includes speaker prefix when provided', () => {
      const tl = buildTimeline([
        { dateString: '8 May 2023', text: 'something happened', speaker: 'Caroline' },
      ]);
      expect(tl.textBlock).toMatch(/Caroline: something happened/);
    });
  });

  // -------------------------------------------------------------------
  describe('memoryToRawEvent', () => {
    it('extracts from `text` + `metadata.date_time`', () => {
      const e = memoryToRawEvent({
        text: 'hello',
        metadata: { date_time: '8 May 2023', speaker: 'A' },
      });
      expect(e).toEqual({
        text: 'hello',
        dateString: '8 May 2023',
        speaker: 'A',
        id: undefined,
      });
    });

    it('falls back to `content` for text', () => {
      const e = memoryToRawEvent({ content: 'X', metadata: { date_time: '2023' } });
      expect(e!.text).toBe('X');
    });

    it('falls back to top-level `date_time`', () => {
      const e = memoryToRawEvent({ text: 'X', date_time: '2023' });
      expect(e!.dateString).toBe('2023');
    });

    it('returns null when text is missing', () => {
      expect(memoryToRawEvent({ metadata: { date_time: '2023' } })).toBeNull();
    });

    it('returns null when no date can be extracted', () => {
      expect(memoryToRawEvent({ text: 'X' })).toBeNull();
    });

    it('passes through id', () => {
      const e = memoryToRawEvent({ text: 'X', date_time: '2023', id: 'mem-42' });
      expect(e!.id).toBe('mem-42');
    });
  });

  // -------------------------------------------------------------------
  describe('buildTimelineFromMemories', () => {
    it('chains memoryToRawEvent → buildTimeline', () => {
      const tl = buildTimelineFromMemories([
        { text: 'A', metadata: { date_time: '2 June 2023' } },
        { text: 'B', metadata: { date_time: '1 June 2023' } },
        { text: 'C — no date', metadata: {} },  // dropped silently
      ]);
      expect(tl.events.map((e) => e.raw.text)).toEqual(['B', 'A']);
    });
  });
});
