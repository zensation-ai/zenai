/**
 * Error Message Sanitization
 *
 * Strips sensitive error details in production to prevent information leakage.
 * In development, returns full error details for debugging.
 *
 * @module utils/sanitize-error
 */

export interface SanitizedError {
  code: string;
  message: string;
}

/**
 * Sanitize an error for client-facing output.
 *
 * In production: returns a generic error message (no stack, no internal details).
 * In development: returns the full error message.
 *
 * @param error - The caught error
 * @param env - Override for NODE_ENV (defaults to process.env.NODE_ENV)
 */
export function sanitizeError(error: unknown, env?: string): SanitizedError {
  const isProduction = (env ?? process.env.NODE_ENV) === 'production';

  if (isProduction) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    };
  }

  // Development: expose details
  if (error instanceof Error) {
    const pgError = error as { code?: string };
    return {
      code: pgError.code ?? 'ERROR',
      message: error.message,
    };
  }

  return {
    code: 'ERROR',
    message: String(error),
  };
}
