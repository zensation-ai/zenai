/**
 * Unit Tests for dateUtils
 *
 * Tests date formatting, relative time, duration,
 * and date comparison utilities.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatDate,
  formatDateWithWeekday,
  formatDateOnly,
  formatTimeOnly,
  formatRelativeTime,
  formatDuration,
  isToday,
  isPast,
} from '../dateUtils';

describe('Date Utilities', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatDate', () => {
    it('formats Date object with German locale', () => {
      const result = formatDate(new Date('2025-01-24T14:30:00'));
      expect(result).toMatch(/24\.01\.2025/);
      expect(result).toMatch(/14:30/);
    });

    it('accepts string input', () => {
      const result = formatDate('2025-01-24T14:30:00');
      expect(result).toMatch(/24\.01\.2025/);
    });
  });

  describe('formatDateWithWeekday', () => {
    it('includes weekday in output', () => {
      const result = formatDateWithWeekday(new Date('2025-01-24T14:30:00'));
      // Friday = Fr. in German
      expect(result).toMatch(/Fr/);
      expect(result).toMatch(/24\.01\.2025/);
    });

    it('accepts string input', () => {
      const result = formatDateWithWeekday('2025-01-24T14:30:00');
      expect(result).toMatch(/24\.01\.2025/);
    });
  });

  describe('formatDateOnly', () => {
    it('formats date without time', () => {
      const result = formatDateOnly(new Date('2025-01-24T14:30:00'));
      expect(result).toMatch(/24\.01\.2025/);
      expect(result).not.toMatch(/14:30/);
    });

    it('accepts string input', () => {
      const result = formatDateOnly('2025-06-15');
      expect(result).toMatch(/15\.06\.2025/);
    });
  });

  describe('formatTimeOnly', () => {
    it('formats time without date', () => {
      const result = formatTimeOnly(new Date('2025-01-24T14:30:00'));
      expect(result).toMatch(/14:30/);
    });

    it('accepts string input', () => {
      const result = formatTimeOnly('2025-01-24T08:05:00');
      expect(result).toMatch(/08:05/);
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "gerade eben" for less than 60 seconds ago', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-24T12:00:30'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('gerade eben');
    });

    it('returns singular minute', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-24T12:01:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('vor 1 Minute');
    });

    it('returns plural minutes', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-24T12:05:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('vor 5 Minuten');
    });

    it('returns singular hour', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-24T13:00:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('vor 1 Stunde');
    });

    it('returns plural hours', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-24T15:00:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('vor 3 Stunden');
    });

    it('returns "gestern" for 1 day ago', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-25T12:00:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('gestern');
    });

    it('returns days for 2-6 days ago', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-27T12:00:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('vor 3 Tagen');
    });

    it('returns weeks for 7-29 days ago', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-02-07T12:00:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('vor 2 Wochen');
    });

    it('returns singular week', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-31T12:00:00'));
      expect(formatRelativeTime(new Date('2025-01-24T12:00:00'))).toBe('vor 1 Woche');
    });

    it('returns formatted date for 30+ days ago', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-01T12:00:00'));
      const result = formatRelativeTime(new Date('2025-01-24T12:00:00'));
      expect(result).toMatch(/24\.01\.2025/);
    });
  });

  describe('formatDuration', () => {
    it('returns null for falsy values', () => {
      expect(formatDuration(null)).toBeNull();
      expect(formatDuration(undefined)).toBeNull();
      expect(formatDuration(0)).toBeNull();
    });

    it('formats minutes under 60', () => {
      expect(formatDuration(45)).toBe('45 Min');
      expect(formatDuration(1)).toBe('1 Min');
    });

    it('formats exact hours', () => {
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(120)).toBe('2h');
    });

    it('formats hours with remaining minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(150)).toBe('2h 30m');
    });
  });

  describe('isToday', () => {
    it('returns true for today', () => {
      expect(isToday(new Date())).toBe(true);
    });

    it('returns false for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });

    it('accepts string input', () => {
      expect(isToday(new Date().toISOString())).toBe(true);
    });
  });

  describe('isPast', () => {
    it('returns true for past date', () => {
      expect(isPast(new Date('2020-01-01'))).toBe(true);
    });

    it('returns false for future date', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      expect(isPast(future)).toBe(false);
    });

    it('accepts string input', () => {
      expect(isPast('2020-01-01')).toBe(true);
    });
  });
});
