/**
 * Logger Utility
 *
 * Environment-aware logging that silences debug/info in production.
 * Warnings and errors always log (they indicate real problems).
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.debug('Cache miss', { key });
 *   logger.error('Request failed', error);
 */

import { captureException } from '../services/sentry';

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log('[DEBUG]', ...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info('[INFO]', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
    // Route errors to Sentry for production visibility
    const err = args.find(a => a instanceof Error);
    if (err) captureException(err as Error);
  },
};
