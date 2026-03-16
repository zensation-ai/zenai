/**
 * Interruptibility Service (Phase 88)
 *
 * Calculates a user's interruptibility score (0-1) based on
 * behavioral signals, enabling the proactive engine to decide
 * when and whether to surface suggestions.
 */

// ─── Types ─────────────────────────────────────────────

export interface InterruptibilitySignals {
  typingRate: number;       // keystrokes per minute (0 = idle, >60 = deep work)
  currentPage: string;      // current page/activity
  timeOfDay: number;        // hour (0-23)
  recentDismissals: number; // dismissals in last hour
  focusModeActive: boolean; // explicit focus mode
  sessionDuration: number;  // minutes on current page
}

export type InterruptibilityLevel = 'dnd' | 'low' | 'normal' | 'available';

export interface InterruptibilityResult {
  score: number;              // 0.0-1.0
  level: InterruptibilityLevel;
  allowedPriorities: string[];
  reason: string;
}

// ─── Priority thresholds ──────────────────────────────

const PRIORITY_THRESHOLDS: Record<string, number> = {
  critical: 0.0,   // always allowed
  high: 0.2,
  medium: 0.5,
  low: 0.7,
};

// ─── Core calculation ─────────────────────────────────

/**
 * Calculate how interruptible the user currently is.
 * Base score = 0.8, adjusted by signals.
 */
export function calculateInterruptibility(
  signals: InterruptibilitySignals,
): InterruptibilityResult {
  // Focus mode overrides everything
  if (signals.focusModeActive) {
    return {
      score: 0.0,
      level: 'dnd',
      allowedPriorities: ['critical'],
      reason: 'Focus mode is active',
    };
  }

  let score = 0.8;
  const reasons: string[] = [];

  // High typing rate → deep work
  if (signals.typingRate > 60) {
    score -= 0.4;
    reasons.push('High typing rate (deep work)');
  } else if (signals.typingRate > 30) {
    score -= 0.2;
    reasons.push('Moderate typing rate');
  }

  // Long session duration → deep work
  if (signals.sessionDuration > 30) {
    score -= 0.2;
    reasons.push('Long session (>30 min)');
  }

  // Recent dismissals → user not interested
  if (signals.recentDismissals > 3) {
    score -= 0.3;
    reasons.push('Multiple recent dismissals');
  } else if (signals.recentDismissals > 1) {
    score -= 0.15;
    reasons.push('Some recent dismissals');
  }

  // Time of day adjustments
  const hour = signals.timeOfDay;
  if (hour >= 9 && hour < 12) {
    score -= 0.1;
    reasons.push('Productive morning hours');
  } else if (hour >= 12 && hour < 13) {
    score += 0.1;
    reasons.push('Lunch break');
  } else if (hour >= 22 || hour < 6) {
    score -= 0.15;
    reasons.push('Late night / early morning');
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  // Determine level
  let level: InterruptibilityLevel;
  if (score <= 0.1) {
    level = 'dnd';
  } else if (score <= 0.35) {
    level = 'low';
  } else if (score <= 0.65) {
    level = 'normal';
  } else {
    level = 'available';
  }

  // Determine allowed priorities
  const allowedPriorities = Object.entries(PRIORITY_THRESHOLDS)
    .filter(([, threshold]) => score >= threshold)
    .map(([priority]) => priority);

  const reason = reasons.length > 0
    ? reasons.join('; ')
    : 'No activity signals detected';

  return { score, level, allowedPriorities, reason };
}

/**
 * Decide whether a suggestion of the given priority should interrupt the user.
 */
export function shouldInterrupt(
  signals: InterruptibilitySignals,
  suggestionPriority: string,
): boolean {
  const result = calculateInterruptibility(signals);
  const threshold = PRIORITY_THRESHOLDS[suggestionPriority] ?? 0.5;
  return result.score >= threshold;
}
