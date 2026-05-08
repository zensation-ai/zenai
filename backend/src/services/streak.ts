/**
 * Streak Service
 *
 * Tracks daily activity streaks for users.
 * Pure functions are DB-independent; getStreak/updateStreak use user_profile.
 *
 * @module services/streak
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}

export interface StreakRecord {
  lastActiveDate: string | null;
  currentStreak: number;
  longestStreak: number;
  streakEnabled: boolean;
}

// ===========================================
// Pure Functions
// ===========================================

/**
 * Returns today's date as a YYYY-MM-DD string (local date).
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Returns yesterday's date as a YYYY-MM-DD string.
 */
function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * Calculates updated streak values based on last active date and current counts.
 *
 * Rules:
 * - null lastActiveDate → start fresh (streak = 1)
 * - lastActiveDate === today → no change (idempotent)
 * - lastActiveDate === yesterday → increment streak
 * - lastActiveDate older → reset to 1
 * - longestStreak is updated whenever currentStreak exceeds it
 */
export function calculateStreak(
  lastActiveDate: string | null,
  currentStreak: number,
  longestStreak: number
): StreakResult {
  const today = getTodayString();
  const yesterday = getYesterdayString();

  let newCurrentStreak: number;

  if (lastActiveDate === null) {
    // First activity ever — start the streak
    newCurrentStreak = 1;
  } else if (lastActiveDate === today) {
    // Already updated today — idempotent, no change
    newCurrentStreak = currentStreak;
  } else if (lastActiveDate === yesterday) {
    // Consecutive day — extend the streak
    newCurrentStreak = currentStreak + 1;
  } else {
    // Gap detected — reset streak
    newCurrentStreak = 1;
  }

  const newLongestStreak = Math.max(longestStreak, newCurrentStreak);

  return {
    currentStreak: newCurrentStreak,
    longestStreak: newLongestStreak,
  };
}

/**
 * Returns true if the streak should be updated for today.
 *
 * Update is needed when:
 * - No previous activity (null)
 * - Last activity was before today
 */
export function shouldUpdateStreak(lastActiveDate: string | null): boolean {
  if (lastActiveDate === null) return true;
  const today = getTodayString();
  return lastActiveDate !== today;
}

// ===========================================
// DB-backed Functions
// ===========================================

/**
 * Retrieves the current streak data for a user in the given context.
 */
export async function getStreak(context: AIContext): Promise<StreakRecord> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        last_active_date,
        current_streak,
        longest_streak,
        streak_enabled
       FROM user_profile
       LIMIT 1`,
      []
    );

    if (!result.rows.length) {
      return {
        lastActiveDate: null,
        currentStreak: 0,
        longestStreak: 0,
        streakEnabled: true,
      };
    }

    const row = result.rows[0];
    return {
      lastActiveDate: row.last_active_date
        ? new Date(row.last_active_date).toISOString().split('T')[0]
        : null,
      currentStreak: row.current_streak ?? 0,
      longestStreak: row.longest_streak ?? 0,
      streakEnabled: row.streak_enabled ?? true,
    };
  } catch (err) {
    logger.error('getStreak failed', err instanceof Error ? err : new Error(String(err)), { context });
    return {
      lastActiveDate: null,
      currentStreak: 0,
      longestStreak: 0,
      streakEnabled: true,
    };
  }
}

/**
 * Idempotently updates the streak for today in the given context.
 * No-ops if already updated today or streak is disabled.
 */
export async function updateStreak(context: AIContext): Promise<StreakResult> {
  const record = await getStreak(context);

  if (!record.streakEnabled) {
    return {
      currentStreak: record.currentStreak,
      longestStreak: record.longestStreak,
    };
  }

  if (!shouldUpdateStreak(record.lastActiveDate)) {
    return {
      currentStreak: record.currentStreak,
      longestStreak: record.longestStreak,
    };
  }

  const { currentStreak, longestStreak } = calculateStreak(
    record.lastActiveDate,
    record.currentStreak,
    record.longestStreak
  );

  const today = getTodayString();

  try {
    await queryContext(
      context,
      `UPDATE user_profile
       SET
         last_active_date = $1,
         current_streak   = $2,
         longest_streak   = $3
       WHERE TRUE`,
      [today, currentStreak, longestStreak]
    );

    logger.info('Streak updated', { context, currentStreak, longestStreak });
  } catch (err) {
    logger.error('updateStreak failed', err instanceof Error ? err : new Error(String(err)), { context });
  }

  return { currentStreak, longestStreak };
}
