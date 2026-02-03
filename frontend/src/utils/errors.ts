import { AxiosError, isAxiosError } from 'axios';

/**
 * Type-safe error extraction from Axios errors
 * Supports both flat and nested error structures from the API
 */
export interface ApiErrorResponse {
  error?: string | { message?: string; code?: string };
  message?: string;
  code?: string;
}

/**
 * Type guard to check if value is an object with a message property
 */
function hasMessage(value: unknown): value is { message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}

/**
 * Extract error message from unknown error
 * Handles various error structures safely without type assertions
 */
export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  // Handle Axios errors with type-safe access
  if (isAxiosError(error)) {
    const data = error.response?.data;

    // Handle nested error object: { error: { message: "..." } }
    if (data && typeof data === 'object' && 'error' in data) {
      const errorField = data.error;
      if (typeof errorField === 'string') {
        return errorField;
      }
      if (hasMessage(errorField)) {
        return errorField.message;
      }
    }

    // Handle flat error structure: { message: "..." }
    if (hasMessage(data)) {
      return data.message;
    }

    // Handle direct string data
    if (typeof data === 'string' && data.length > 0) {
      return data;
    }

    // Fall back to Axios error message
    return error.message || fallback;
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message || fallback;
  }

  // Handle plain strings
  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}

/**
 * Check if error is a network/connection error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return !error.response || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK';
  }
  return false;
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.response?.status === 401 || error.response?.status === 403;
  }
  return false;
}

/**
 * Check if error is a rate limit / quota error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.response?.status === 429;
  }
  return false;
}

/**
 * Check if error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.code === 'ECONNABORTED' || error.response?.status === 504;
  }
  return false;
}

/**
 * Check if error is a conflict error (concurrent edit)
 */
export function isConflictError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.response?.status === 409;
  }
  return false;
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.response?.status === 400 || error.response?.status === 422;
  }
  return false;
}

/**
 * Error categories for contextual error handling
 */
export type ErrorCategory =
  | 'network'
  | 'offline'
  | 'server'
  | 'auth'
  | 'validation'
  | 'timeout'
  | 'quota'
  | 'conflict'
  | 'unknown';

/**
 * Categorize an error for contextual handling
 */
export function categorizeError(error: unknown): ErrorCategory {
  // Check offline first
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }

  if (isNetworkError(error)) {
    return 'network';
  }

  if (isTimeoutError(error)) {
    return 'timeout';
  }

  if (isRateLimitError(error)) {
    return 'quota';
  }

  if (isConflictError(error)) {
    return 'conflict';
  }

  if (isAuthError(error)) {
    return 'auth';
  }

  if (isValidationError(error)) {
    return 'validation';
  }

  // Server errors (5xx)
  if (error instanceof AxiosError && error.response?.status && error.response.status >= 500) {
    return 'server';
  }

  return 'unknown';
}

/**
 * Error content for user-friendly display
 */
export interface ErrorContent {
  title: string;
  description: string;
  suggestion: string;
  canRetry: boolean;
}

/**
 * Get user-friendly error content based on category
 */
export function getErrorContent(category: ErrorCategory): ErrorContent {
  const errorContents: Record<ErrorCategory, ErrorContent> = {
    offline: {
      title: 'Du bist offline',
      description: 'Keine Internetverbindung verfügbar.',
      suggestion: 'Deine Änderungen werden lokal gespeichert und automatisch synchronisiert, sobald du wieder online bist.',
      canRetry: false,
    },
    network: {
      title: 'Verbindungsproblem',
      description: 'Der Server ist momentan nicht erreichbar.',
      suggestion: 'Überprüfe deine Internetverbindung und versuche es in wenigen Sekunden erneut.',
      canRetry: true,
    },
    timeout: {
      title: 'Zeitüberschreitung',
      description: 'Die Anfrage hat zu lange gedauert.',
      suggestion: 'Der Server ist möglicherweise überlastet. Versuche es in einigen Sekunden erneut.',
      canRetry: true,
    },
    quota: {
      title: 'Zu viele Anfragen',
      description: 'Du hast das Limit für Anfragen erreicht.',
      suggestion: 'Bitte warte einen Moment, bevor du es erneut versuchst.',
      canRetry: true,
    },
    conflict: {
      title: 'Konflikt erkannt',
      description: 'Die Daten wurden zwischenzeitlich von anderer Stelle geändert.',
      suggestion: 'Lade die Seite neu, um die aktuellen Daten zu sehen.',
      canRetry: false,
    },
    auth: {
      title: 'Nicht autorisiert',
      description: 'Deine Sitzung ist möglicherweise abgelaufen.',
      suggestion: 'Bitte melde dich erneut an.',
      canRetry: false,
    },
    validation: {
      title: 'Ungültige Eingabe',
      description: 'Die eingegebenen Daten sind nicht korrekt.',
      suggestion: 'Überprüfe deine Eingaben und versuche es erneut.',
      canRetry: false,
    },
    server: {
      title: 'Serverfehler',
      description: 'Auf dem Server ist ein Problem aufgetreten.',
      suggestion: 'Wir arbeiten daran. Bitte versuche es später erneut.',
      canRetry: true,
    },
    unknown: {
      title: 'Ein Fehler ist aufgetreten',
      description: 'Etwas ist schiefgelaufen.',
      suggestion: 'Bitte versuche es erneut oder kontaktiere den Support.',
      canRetry: true,
    },
  };

  return errorContents[category];
}

/**
 * Log error with context (for debugging)
 */
export function logError(context: string, error: unknown): void {
  const message = getErrorMessage(error);
  const category = categorizeError(error);

  console.error(`[${context}] [${category}] ${message}`, error);
}
