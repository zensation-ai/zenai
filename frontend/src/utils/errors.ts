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
 * Log error with context (for debugging)
 */
export function logError(context: string, error: unknown): void {
  const message = getErrorMessage(error);
  const isNetwork = isNetworkError(error);

  console.error(`[${context}] ${isNetwork ? 'Network error: ' : ''}${message}`, error);
}
