/**
 * Unit Tests for error utilities
 *
 * Tests error extraction, classification, categorization,
 * and user-friendly error content.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError } from 'axios';
import {
  getErrorMessage,
  isNetworkError,
  isAuthError,
  isRateLimitError,
  isTimeoutError,
  isConflictError,
  isValidationError,
  categorizeError,
  getErrorContent,
  logError,
} from '../errors';

function makeAxiosError(
  status?: number,
  data?: unknown,
  code?: string,
): AxiosError {
  const error = new AxiosError(
    'Request failed',
    code,
    undefined,
    undefined,
    status
      ? ({ status, data } as never)
      : undefined,
  );
  return error;
}

describe('Error Utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getErrorMessage', () => {
    it('extracts nested error string from Axios response', () => {
      const err = makeAxiosError(400, { error: 'Bad request body' });
      expect(getErrorMessage(err)).toBe('Bad request body');
    });

    it('extracts nested error.message from Axios response', () => {
      const err = makeAxiosError(400, { error: { message: 'Validation failed' } });
      expect(getErrorMessage(err)).toBe('Validation failed');
    });

    it('extracts flat message from Axios response', () => {
      const err = makeAxiosError(500, { message: 'Internal server error' });
      expect(getErrorMessage(err)).toBe('Internal server error');
    });

    it('extracts string data from Axios response', () => {
      const err = makeAxiosError(500, 'Something broke');
      expect(getErrorMessage(err)).toBe('Something broke');
    });

    it('falls back to Axios error message', () => {
      const err = makeAxiosError(500, { foo: 'bar' });
      expect(getErrorMessage(err)).toBe('Request failed');
    });

    it('falls back to provided fallback for Axios error without message', () => {
      const err = new AxiosError('');
      expect(getErrorMessage(err, 'Custom fallback')).toBe('Custom fallback');
    });

    it('extracts message from standard Error', () => {
      expect(getErrorMessage(new Error('Standard error'))).toBe('Standard error');
    });

    it('handles Error with empty message', () => {
      expect(getErrorMessage(new Error(''), 'Fallback')).toBe('Fallback');
    });

    it('returns string errors directly', () => {
      expect(getErrorMessage('Direct string error')).toBe('Direct string error');
    });

    it('returns fallback for unknown types', () => {
      expect(getErrorMessage(42)).toBe('An error occurred');
      expect(getErrorMessage(null)).toBe('An error occurred');
      expect(getErrorMessage(undefined)).toBe('An error occurred');
      expect(getErrorMessage({})).toBe('An error occurred');
    });

    it('uses custom fallback', () => {
      expect(getErrorMessage(null, 'Custom')).toBe('Custom');
    });
  });

  describe('isNetworkError', () => {
    it('returns true when no response (network failure)', () => {
      const err = new AxiosError('Network Error', 'ERR_NETWORK');
      expect(isNetworkError(err)).toBe(true);
    });

    it('returns true for ECONNABORTED', () => {
      const err = makeAxiosError(undefined, undefined, 'ECONNABORTED');
      expect(isNetworkError(err)).toBe(true);
    });

    it('returns false for normal Axios error with response', () => {
      const err = makeAxiosError(400, {});
      expect(isNetworkError(err)).toBe(false);
    });

    it('returns false for non-Axios errors', () => {
      expect(isNetworkError(new Error('fail'))).toBe(false);
      expect(isNetworkError('string')).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('returns true for 401', () => {
      expect(isAuthError(makeAxiosError(401))).toBe(true);
    });

    it('returns true for 403', () => {
      expect(isAuthError(makeAxiosError(403))).toBe(true);
    });

    it('returns false for other status codes', () => {
      expect(isAuthError(makeAxiosError(400))).toBe(false);
      expect(isAuthError(makeAxiosError(500))).toBe(false);
    });

    it('returns false for non-Axios errors', () => {
      expect(isAuthError(new Error('fail'))).toBe(false);
    });
  });

  describe('isRateLimitError', () => {
    it('returns true for 429', () => {
      expect(isRateLimitError(makeAxiosError(429))).toBe(true);
    });

    it('returns false for other status codes', () => {
      expect(isRateLimitError(makeAxiosError(400))).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    it('returns true for ECONNABORTED code', () => {
      const err = makeAxiosError(undefined, undefined, 'ECONNABORTED');
      expect(isTimeoutError(err)).toBe(true);
    });

    it('returns true for 504 status', () => {
      expect(isTimeoutError(makeAxiosError(504))).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isTimeoutError(makeAxiosError(500))).toBe(false);
    });
  });

  describe('isConflictError', () => {
    it('returns true for 409', () => {
      expect(isConflictError(makeAxiosError(409))).toBe(true);
    });

    it('returns false for other status codes', () => {
      expect(isConflictError(makeAxiosError(400))).toBe(false);
    });
  });

  describe('isValidationError', () => {
    it('returns true for 400', () => {
      expect(isValidationError(makeAxiosError(400))).toBe(true);
    });

    it('returns true for 422', () => {
      expect(isValidationError(makeAxiosError(422))).toBe(true);
    });

    it('returns false for other status codes', () => {
      expect(isValidationError(makeAxiosError(500))).toBe(false);
    });
  });

  describe('categorizeError', () => {
    it('returns offline when navigator.onLine is false', () => {
      const original = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      expect(categorizeError(new Error('any'))).toBe('offline');
      Object.defineProperty(navigator, 'onLine', { value: original, configurable: true });
    });

    it('returns network for network errors', () => {
      const err = new AxiosError('Network Error', 'ERR_NETWORK');
      expect(categorizeError(err)).toBe('network');
    });

    it('returns timeout for timeout errors', () => {
      expect(categorizeError(makeAxiosError(504))).toBe('timeout');
    });

    it('returns quota for rate limit errors', () => {
      expect(categorizeError(makeAxiosError(429))).toBe('quota');
    });

    it('returns conflict for 409', () => {
      expect(categorizeError(makeAxiosError(409))).toBe('conflict');
    });

    it('returns auth for 401/403', () => {
      expect(categorizeError(makeAxiosError(401))).toBe('auth');
      expect(categorizeError(makeAxiosError(403))).toBe('auth');
    });

    it('returns validation for 400/422', () => {
      expect(categorizeError(makeAxiosError(400))).toBe('validation');
      expect(categorizeError(makeAxiosError(422))).toBe('validation');
    });

    it('returns server for 5xx', () => {
      expect(categorizeError(makeAxiosError(500))).toBe('server');
      expect(categorizeError(makeAxiosError(503))).toBe('server');
    });

    it('returns unknown for unclassifiable errors', () => {
      expect(categorizeError(new Error('random'))).toBe('unknown');
      expect(categorizeError('string error')).toBe('unknown');
    });
  });

  describe('getErrorContent', () => {
    it('returns correct content for each category', () => {
      const categories = [
        'offline', 'network', 'timeout', 'quota',
        'conflict', 'auth', 'validation', 'server', 'unknown',
      ] as const;

      for (const cat of categories) {
        const content = getErrorContent(cat);
        expect(content).toHaveProperty('title');
        expect(content).toHaveProperty('description');
        expect(content).toHaveProperty('suggestion');
        expect(content).toHaveProperty('canRetry');
        expect(typeof content.title).toBe('string');
        expect(typeof content.canRetry).toBe('boolean');
      }
    });

    it('marks retriable categories correctly', () => {
      expect(getErrorContent('network').canRetry).toBe(true);
      expect(getErrorContent('timeout').canRetry).toBe(true);
      expect(getErrorContent('server').canRetry).toBe(true);
      expect(getErrorContent('offline').canRetry).toBe(false);
      expect(getErrorContent('auth').canRetry).toBe(false);
      expect(getErrorContent('conflict').canRetry).toBe(false);
      expect(getErrorContent('validation').canRetry).toBe(false);
    });
  });

  describe('logError', () => {
    it('logs error with context and category', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const err = new Error('test error');

      logError('TestContext', err);

      expect(spy).toHaveBeenCalledWith(
        '[TestContext] [unknown] test error',
        err,
      );
    });
  });
});
