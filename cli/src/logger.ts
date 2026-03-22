/**
 * CLI Logger (Phase 132)
 *
 * Simple logger for the ZenAI CLI Agent.
 *
 * @module cli/logger
 */

export const logger = {
  info: (...args: unknown[]) => console.log('[ZenAI]', ...args),
  debug: (..._args: unknown[]) => {},  // silent by default
  warn: (...args: unknown[]) => console.warn('[ZenAI WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ZenAI ERROR]', ...args),
};
