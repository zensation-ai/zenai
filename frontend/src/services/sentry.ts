/**
 * Phase 66: Sentry Error Tracking for Frontend
 *
 * Provides browser error tracking, performance monitoring,
 * and session replay via Sentry React SDK.
 */

import * as Sentry from '@sentry/react';

let sentryInitialized = false;

/**
 * Initialize Sentry for the frontend.
 * No-op if VITE_SENTRY_DSN is not configured.
 */
export function initSentry(): boolean {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info('Sentry DSN not configured — error tracking disabled');
    }
    return false;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || 'zenai-frontend@0.0.0',

    // Performance: sample 10% in production, 100% in dev
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session Replay: capture 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Filter noisy errors
    beforeSend(event) {
      // Ignore network errors from external services
      if (event.exception?.values?.[0]?.value?.includes('Network Error')) {
        return null;
      }
      // Ignore ResizeObserver loop errors (browser quirk)
      if (event.exception?.values?.[0]?.value?.includes('ResizeObserver loop')) {
        return null;
      }
      return event;
    },

    // Don't send PII by default
    sendDefaultPii: false,
  });

  sentryInitialized = true;
  return true;
}

/**
 * Set user context for Sentry (call after authentication).
 */
export function setSentryUser(user: { id: string; email?: string } | null): void {
  if (!sentryInitialized) return;
  Sentry.setUser(user);
}

/**
 * Capture an exception with optional context.
 */
export function captureException(
  error: Error | unknown,
  context?: Record<string, unknown>
): void {
  if (!sentryInitialized) return;

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Check if Sentry is initialized.
 */
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

// Re-export for ErrorBoundary integration
export { Sentry };
