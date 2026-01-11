import { AxiosError } from 'axios';

/**
 * Type-safe error extraction from Axios errors
 */
export interface ApiErrorResponse {
  error?: string;
  message?: string;
  code?: string;
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorResponse | undefined;
    return data?.error || data?.message || error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

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
