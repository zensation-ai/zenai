/**
 * Phase 66: Sentry Error Tracking & Performance Monitoring
 *
 * Provides centralized error tracking, performance monitoring,
 * and distributed tracing via Sentry SDK.
 */

import * as Sentry from '@sentry/node';
import { logger } from '../../utils/logger';
import { scrubSentryEvent, scrubSentryBreadcrumb } from './pii-scrubber';

let sentryInitialized = false;

/**
 * Initialize Sentry for the backend.
 * No-op if SENTRY_DSN is not configured.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry DSN not configured — error tracking disabled', {
      operation: 'sentry.init',
    });
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || `zenai-backend@${process.env.npm_package_version || '0.0.0'}`,

    // Performance: sample 20% of transactions in production, 100% in dev
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

    // Only send errors in production or when explicitly enabled
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',

    // Filter out noisy / expected errors and scrub PII (Sprint 1.4)
    beforeSend(event, hint) {
      const error = hint?.originalException;

      // Don't report expected operational errors (4xx)
      if (error && typeof error === 'object' && 'isOperational' in error) {
        const appError = error as { isOperational?: boolean; statusCode?: number };
        if (appError.isOperational && appError.statusCode && appError.statusCode < 500) {
          return null;
        }
      }

      // PII scrubbing: remove secrets/tokens/emails/IPs before the event
      // leaves the process. See services/observability/pii-scrubber.ts.
      return scrubSentryEvent(
        event as unknown as Record<string, unknown>
      ) as unknown as typeof event;
    },

    // Scrub PII on breadcrumbs too — console logs, HTTP req metadata etc.
    beforeBreadcrumb(breadcrumb) {
      return scrubSentryBreadcrumb(
        breadcrumb as unknown as Record<string, unknown>
      ) as unknown as typeof breadcrumb;
    },

    // Do NOT auto-capture PII (headers with auth, IPs) at all — the scrubbers
    // are a second line of defense, not the first.
    sendDefaultPii: false,

    // Integrations
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
  });

  sentryInitialized = true;
  logger.info('Sentry initialized', {
    operation: 'sentry.init',
    environment: process.env.NODE_ENV,
  });

  return true;
}

/**
 * Capture an exception in Sentry with optional context.
 */
export function captureException(
  error: Error | unknown,
  context?: Record<string, unknown>
): void {
  if (!sentryInitialized) {return;}

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a message in Sentry.
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: Record<string, unknown>
): void {
  if (!sentryInitialized) {return;}

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureMessage(message, level);
  });
}

/**
 * Set user context for Sentry (call after authentication).
 */
export function setUser(user: { id: string; email?: string; role?: string } | null): void {
  if (!sentryInitialized) {return;}
  Sentry.setUser(user);
}

/**
 * Flush pending events before process exit.
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!sentryInitialized) {return;}
  await Sentry.flush(timeout);
}

/**
 * Check if Sentry is initialized.
 */
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

// Re-export Sentry for middleware setup
export { Sentry };
