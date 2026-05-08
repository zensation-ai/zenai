/**
 * Streak Service - Unit Tests
 */

import { calculateStreak, shouldUpdateStreak } from '../../../services/streak';

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Helper: date strings relative to today
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

const today = toDateString(new Date());

const yesterday = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateString(d);
})();

const threeDaysAgo = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return toDateString(d);
})();

describe('Streak Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ========================================
  // calculateStreak (pure function)
  // ========================================
  describe('calculateStreak', () => {
    it('returns currentStreak: 1 and longestStreak: 1 when lastActiveDate is null', () => {
      const result = calculateStreak(null, 0, 0);
      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(1);
    });

    it('increments streak when lastActiveDate was yesterday', () => {
      const result = calculateStreak(yesterday, 5, 10);
      expect(result.currentStreak).toBe(6);
      expect(result.longestStreak).toBe(10);
    });

    it('resets streak to 1 when lastActiveDate was more than 1 day ago', () => {
      const result = calculateStreak(threeDaysAgo, 5, 10);
      expect(result.currentStreak).toBe(1);
    });

    it('does not double-count when lastActiveDate is today', () => {
      const result = calculateStreak(today, 5, 10);
      expect(result.currentStreak).toBe(5);
    });

    it('updates longestStreak when new streak exceeds it', () => {
      const result = calculateStreak(yesterday, 10, 10);
      expect(result.longestStreak).toBe(11);
    });
  });

  // ========================================
  // shouldUpdateStreak (pure function)
  // ========================================
  describe('shouldUpdateStreak', () => {
    it('returns true when lastActiveDate is null (first ever activity)', () => {
      expect(shouldUpdateStreak(null)).toBe(true);
    });

    it('returns true when lastActiveDate was yesterday', () => {
      expect(shouldUpdateStreak(yesterday)).toBe(true);
    });

    it('returns false when lastActiveDate is today (already updated)', () => {
      expect(shouldUpdateStreak(today)).toBe(false);
    });
  });
});
