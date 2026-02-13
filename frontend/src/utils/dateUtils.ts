/**
 * Centralized Date Formatting Utilities
 * Single source of truth for date/time formatting
 */

/** Accepted input types for all date utility functions. */
type DateInput = string | Date | null | undefined;

/**
 * Parse a DateInput into a valid Date, or return null if invalid.
 * Shared helper that eliminates the repeated null-check + parse + validate pattern.
 */
function parseDate(input: DateInput): Date | null {
  if (!input) return null;
  const date = typeof input === 'string' ? new Date(input) : input;
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format date for display (German locale)
 * Example: "24.01.2025, 14:30"
 */
export function formatDate(input: DateInput): string {
  const date = parseDate(input);
  if (!date) return '–';
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date with weekday
 * Example: "Fr., 24.01.2025, 14:30"
 */
export function formatDateWithWeekday(input: DateInput): string {
  const date = parseDate(input);
  if (!date) return '–';
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date with long weekday and month names
 * Example: "Freitag, 24. Januar 2025, 14:30"
 */
export function formatDateLong(input: DateInput): string {
  const date = parseDate(input);
  if (!date) return '–';
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date only (no time)
 * Example: "24.01.2025"
 */
export function formatDateOnly(input: DateInput): string {
  const date = parseDate(input);
  if (!date) return '–';
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format time only
 * Example: "14:30"
 */
export function formatTimeOnly(input: DateInput): string {
  const date = parseDate(input);
  if (!date) return '–';
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time
 * Example: "vor 5 Minuten", "gestern", "vor 2 Tagen"
 */
export function formatRelativeTime(input: DateInput): string {
  const date = parseDate(input);
  if (!date) return '–';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Minute${diffMin !== 1 ? 'n' : ''}`;
  if (diffHour < 24) return `vor ${diffHour} Stunde${diffHour !== 1 ? 'n' : ''}`;
  if (diffDay === 1) return 'gestern';
  if (diffDay < 7) return `vor ${diffDay} Tagen`;
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return `vor ${weeks} Woche${weeks !== 1 ? 'n' : ''}`;
  }

  return formatDateOnly(date);
}

/**
 * Format duration in minutes
 * Example: "45 Min", "1h 30m"
 */
export function formatDuration(minutes: number | undefined | null): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Check if date is today
 */
export function isToday(input: DateInput): boolean {
  const date = parseDate(input);
  if (!date) return false;
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if date is in the past
 */
export function isPast(input: DateInput): boolean {
  const date = parseDate(input);
  if (!date) return false;
  return date.getTime() < Date.now();
}
