/**
 * Centralized Error Handler
 *
 * Provides a single function to classify, extract user-facing messages,
 * and determine retry eligibility for any error.
 *
 * @module utils/error-handler
 */

import { isAxiosError } from 'axios';
import { logger } from './logger';

// ============================================
// Types
// ============================================

export type ErrorType = 'network' | 'auth' | 'validation' | 'server' | 'unknown';

export interface HandledError {
  /** Classification of the error */
  type: ErrorType;
  /** German user-facing message */
  userMessage: string;
  /** Whether the caller should offer a retry */
  shouldRetry: boolean;
  /** Original error for logging/debugging */
  originalError: unknown;
}

// ============================================
// German user messages per type
// ============================================

const USER_MESSAGES: Record<ErrorType, string> = {
  network: 'Verbindung fehlgeschlagen. Bitte pruefe deine Internetverbindung.',
  auth: 'Sitzung abgelaufen. Bitte melde dich erneut an.',
  validation: 'Ungueltige Eingabe. Bitte pruefe deine Daten.',
  server: 'Serverfehler. Bitte versuche es spaeter erneut.',
  unknown: 'Ein unerwarteter Fehler ist aufgetreten.',
};

const RETRY_MAP: Record<ErrorType, boolean> = {
  network: true,
  auth: false,
  validation: false,
  server: true,
  unknown: true,
};

// ============================================
// Classification
// ============================================

function classifyError(error: unknown): ErrorType {
  // Fetch API: TypeError with "Failed to fetch" or "NetworkError"
  if (
    error instanceof TypeError &&
    (error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('Network request failed'))
  ) {
    return 'network';
  }

  // Axios errors with response status
  if (isAxiosError(error)) {
    // No response = network issue
    if (!error.response) return 'network';

    const status = error.response.status;
    if (status === 401 || status === 403) return 'auth';
    if (status === 400 || status === 422) return 'validation';
    if (status >= 500) return 'server';
  }

  // Plain Error with status-like messages
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('network')) return 'network';
    if (msg.includes('401') || msg.includes('authentifizierung') || msg.includes('unauthorized')) return 'auth';
  }

  return 'unknown';
}

// ============================================
// Public API
// ============================================

/**
 * Classify and handle any error, returning a structured result
 * with a German user-facing message and retry recommendation.
 *
 * @param error - The caught error (any type)
 * @param context - Optional context string for logging (e.g. 'GeneralChat:send')
 */
export function handleError(error: unknown, context?: string): HandledError {
  const type = classifyError(error);

  if (context) {
    logger.error(`[${context}] [${type}]`, error);
  }

  return {
    type,
    userMessage: USER_MESSAGES[type],
    shouldRetry: RETRY_MAP[type],
    originalError: error,
  };
}
