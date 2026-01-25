/**
 * Timing Constants
 *
 * Centralized timing values for consistency and maintainability
 */

/** How long an idea is considered "new" (5 minutes) */
export const IS_NEW_THRESHOLD_MS = 5 * 60 * 1000;

/** How long to keep local ideas before considering them synced (2 minutes) */
export const RECENT_CUTOFF_MS = 2 * 60 * 1000;

/** Interval for cross-device sync polling (30 seconds) */
export const SYNC_INTERVAL_MS = 30 * 1000;

/** Maximum characters allowed in text input */
export const MAX_TEXT_INPUT_CHARS = 10000;

/** Character count warning threshold */
export const CHAR_WARNING_THRESHOLD = 500;

/** Toast auto-dismiss duration (5 seconds) */
export const TOAST_DURATION_MS = 5000;

/** Debounce delay for search input (300ms) */
export const SEARCH_DEBOUNCE_MS = 300;

/** Animation step delays for AI processing overlay */
export const AI_PROCESSING_STEP_DELAY_MS = 200;

/** Initial delay before showing first AI processing step */
export const AI_PROCESSING_INITIAL_DELAY_MS = 300;
