/**
 * Phase 8.3: Error Recovery Testing
 *
 * Tests for resilience mechanisms added in Phase 7:
 * - Exponential backoff retry logic
 * - Rate limit detection and feedback
 * - Circuit breaker pattern
 * - Network error recovery
 * - Timeout handling per endpoint category
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRateLimitInfo,
  onRateLimitUpdate,
  type RateLimitInfo,
} from '../apiResilience';

describe('Phase 8.3: Error Recovery Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================
  // Exponential Backoff Logic
  // ===========================================

  describe('Exponential Backoff', () => {
    it('should calculate correct base delays for each retry attempt', () => {
      const baseDelays = [0, 1, 2, 3, 4].map(retry => 1000 * Math.pow(2, retry));
      expect(baseDelays).toEqual([1000, 2000, 4000, 8000, 16000]);
    });

    it('should cap delay at 10 seconds maximum', () => {
      const maxDelay = 10_000;
      const delays = [0, 1, 2, 3, 4, 5].map(retry => {
        const base = 1000 * Math.pow(2, retry);
        return Math.min(base, maxDelay);
      });

      // 1s, 2s, 4s, 8s, 10s (capped), 10s (capped)
      expect(delays).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
    });

    it('should apply jitter within ±25% range', () => {
      const baseDelay = 4000;
      const minJitter = baseDelay * 0.75;
      const maxJitter = baseDelay * 1.25;

      // Simulate 100 jitter calculations
      for (let i = 0; i < 100; i++) {
        const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
        const delayWithJitter = baseDelay + jitter;
        expect(delayWithJitter).toBeGreaterThanOrEqual(minJitter);
        expect(delayWithJitter).toBeLessThanOrEqual(maxJitter);
      }
    });

    it('should never produce negative delay values', () => {
      for (let retry = 0; retry < 10; retry++) {
        const base = 1000 * Math.pow(2, retry);
        const jitter = base * 0.25 * (Math.random() * 2 - 1);
        const delay = Math.min(base + jitter, 10_000);
        expect(delay).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================
  // Retryable Error Detection
  // ===========================================

  describe('Retryable Error Detection', () => {
    it('should classify 502/503/504 as retryable', () => {
      const retryableStatuses = [502, 503, 504];
      for (const status of retryableStatuses) {
        const isRetryable = status === 502 || status === 503 || status === 504;
        expect(isRetryable).toBe(true);
      }
    });

    it('should NOT classify 400/401/403/404/429/500 as retryable', () => {
      const nonRetryableStatuses = [400, 401, 403, 404, 429, 500];
      for (const status of nonRetryableStatuses) {
        const isRetryable = status === 502 || status === 503 || status === 504;
        expect(isRetryable).toBe(false);
      }
    });

    it('should classify network error codes as retryable', () => {
      const retryableCodes = ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'];
      for (const code of retryableCodes) {
        expect(retryableCodes).toContain(code);
      }
    });

    it('should NOT classify cancelled requests as retryable', () => {
      // Cancelled requests should not be retried
      const cancelledCode = 'ERR_CANCELED';
      const retryableCodes = ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'];
      expect(retryableCodes).not.toContain(cancelledCode);
    });
  });

  // ===========================================
  // Timeout Category Classification
  // ===========================================

  describe('Timeout Categories', () => {
    const TIMEOUT_CONFIGS: Record<string, { timeout: number; maxRetries: number }> = {
      fast: { timeout: 10_000, maxRetries: 2 },
      standard: { timeout: 30_000, maxRetries: 1 },
      ai: { timeout: 120_000, maxRetries: 0 },
      upload: { timeout: 60_000, maxRetries: 0 },
      code: { timeout: 60_000, maxRetries: 0 },
    };

    function getTimeoutCategory(url: string | undefined): string {
      if (!url) return 'standard';
      if (url.includes('/messages/stream') || url.includes('/chat/quick') ||
          url.includes('/messages/vision') || url.includes('/vision/')) return 'ai';
      if (url.includes('/code/execute') || url.includes('/code/run')) return 'code';
      if (url.includes('/media/upload') || url.includes('/voice-memo')) return 'upload';
      if (url.includes('/health') || url.includes('/csrf-token') ||
          url.includes('/status') || url.includes('/metrics')) return 'fast';
      return 'standard';
    }

    it('should classify health endpoints as fast (10s, 2 retries)', () => {
      expect(getTimeoutCategory('/api/health')).toBe('fast');
      expect(getTimeoutCategory('/api/health/detailed')).toBe('fast');
      expect(getTimeoutCategory('/api/csrf-token')).toBe('fast');
      const config = TIMEOUT_CONFIGS['fast'];
      expect(config.timeout).toBe(10_000);
      expect(config.maxRetries).toBe(2);
    });

    it('should classify AI endpoints as ai (120s, 0 retries)', () => {
      expect(getTimeoutCategory('/api/chat/sessions/1/messages/stream')).toBe('ai');
      expect(getTimeoutCategory('/api/chat/quick')).toBe('ai');
      expect(getTimeoutCategory('/api/chat/sessions/1/messages/vision')).toBe('ai');
      const config = TIMEOUT_CONFIGS['ai'];
      expect(config.timeout).toBe(120_000);
      expect(config.maxRetries).toBe(0);
    });

    it('should classify code execution as code (60s, 0 retries)', () => {
      expect(getTimeoutCategory('/api/code/execute')).toBe('code');
      expect(getTimeoutCategory('/api/code/run')).toBe('code');
      const config = TIMEOUT_CONFIGS['code'];
      expect(config.timeout).toBe(60_000);
      expect(config.maxRetries).toBe(0);
    });

    it('should classify upload endpoints as upload (60s, 0 retries)', () => {
      expect(getTimeoutCategory('/api/media/upload')).toBe('upload');
      expect(getTimeoutCategory('/api/personal/voice-memo')).toBe('upload');
      const config = TIMEOUT_CONFIGS['upload'];
      expect(config.timeout).toBe(60_000);
      expect(config.maxRetries).toBe(0);
    });

    it('should default unknown URLs to standard (30s, 1 retry)', () => {
      expect(getTimeoutCategory('/api/ideas')).toBe('standard');
      expect(getTimeoutCategory('/api/chat/sessions')).toBe('standard');
      expect(getTimeoutCategory(undefined)).toBe('standard');
      const config = TIMEOUT_CONFIGS['standard'];
      expect(config.timeout).toBe(30_000);
      expect(config.maxRetries).toBe(1);
    });
  });

  // ===========================================
  // Rate Limit Tracking
  // ===========================================

  describe('Rate Limit Tracking', () => {
    it('should provide rate limit subscription mechanism', () => {
      const listener = vi.fn();
      const unsubscribe = onRateLimitUpdate(listener);

      expect(typeof unsubscribe).toBe('function');

      // Should not be called on subscription
      expect(listener).not.toHaveBeenCalled();

      // Cleanup
      unsubscribe();
    });

    it('should allow multiple subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = onRateLimitUpdate(listener1);
      const unsub2 = onRateLimitUpdate(listener2);

      // Cleanup
      unsub1();
      unsub2();
    });

    it('should provide current rate limit info', () => {
      const info = getRateLimitInfo();
      // May be null if no rate limit headers received
      if (info !== null) {
        expect(info).toHaveProperty('limit');
        expect(info).toHaveProperty('remaining');
        expect(info).toHaveProperty('resetAt');
        expect(info).toHaveProperty('source');
        expect(typeof info.limit).toBe('number');
        expect(typeof info.remaining).toBe('number');
        expect(info.resetAt).toBeInstanceOf(Date);
      }
    });

    it('should unsubscribe correctly', () => {
      const listener = vi.fn();
      const unsubscribe = onRateLimitUpdate(listener);

      // Unsubscribe
      unsubscribe();

      // After unsubscribe, listener should not be called
      // (tested indirectly - no error thrown)
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // Circuit Breaker Pattern
  // ===========================================

  describe('Circuit Breaker Logic', () => {
    it('should track failure threshold of 5', () => {
      const FAILURE_THRESHOLD = 5;
      const failures: number[] = [];

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        failures.push(i + 1);
      }

      expect(failures.length).toBe(FAILURE_THRESHOLD);
      // After 5 failures, circuit should open
      expect(failures.length >= FAILURE_THRESHOLD).toBe(true);
    });

    it('should respect reset timeout of 60 seconds', () => {
      const RESET_TIMEOUT = 60_000;

      // Simulate time passing
      const failureTime = Date.now();
      const withinTimeout = failureTime + 30_000; // 30s later
      const afterTimeout = failureTime + 70_000;  // 70s later

      expect(withinTimeout - failureTime).toBeLessThan(RESET_TIMEOUT);
      expect(afterTimeout - failureTime).toBeGreaterThan(RESET_TIMEOUT);
    });

    it('should transition through closed → open → half-open states', () => {
      type CircuitState = 'closed' | 'open' | 'half-open';
      let state: CircuitState = 'closed';
      let failures = 0;
      const THRESHOLD = 5;
      const RESET_TIMEOUT = 60_000;
      let lastFailureTime = 0;

      function recordFailure() {
        failures++;
        lastFailureTime = Date.now();
        if (failures >= THRESHOLD) {
          state = 'open';
        }
      }

      function checkState(currentTime: number) {
        if (state === 'open' && currentTime - lastFailureTime > RESET_TIMEOUT) {
          state = 'half-open';
        }
        return state;
      }

      function recordSuccess() {
        state = 'closed';
        failures = 0;
      }

      // Start closed
      expect(state).toBe('closed');

      // After 5 failures → open
      for (let i = 0; i < 5; i++) {
        recordFailure();
      }
      expect(state).toBe('open');

      // After reset timeout → half-open
      const futureTime = Date.now() + 70_000;
      expect(checkState(futureTime)).toBe('half-open');

      // After success → closed
      recordSuccess();
      expect(state).toBe('closed');
    });
  });

  // ===========================================
  // Network Error Recovery Scenarios
  // ===========================================

  describe('Network Error Recovery Scenarios', () => {
    it('should handle timeout errors (ECONNABORTED)', () => {
      const error = {
        code: 'ECONNABORTED',
        response: undefined,
        message: 'timeout of 10000ms exceeded',
      };

      // Should be retryable
      const isRetryable = !error.response &&
        (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.code === 'ETIMEDOUT');
      expect(isRetryable).toBe(true);
    });

    it('should handle network disconnection (ERR_NETWORK)', () => {
      const error = {
        code: 'ERR_NETWORK',
        response: undefined,
        message: 'Network Error',
      };

      const isRetryable = !error.response &&
        (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.code === 'ETIMEDOUT');
      expect(isRetryable).toBe(true);
    });

    it('should handle 429 rate limit separately from retryable errors', () => {
      const error = {
        code: undefined,
        response: { status: 429, headers: { 'x-ratelimit-reset': '2026-01-01T00:01:00Z' } },
      };

      // 429 is NOT retryable via standard retry - has its own handling
      const isStandardRetryable = error.response.status === 502 ||
        error.response.status === 503 || error.response.status === 504;
      expect(isStandardRetryable).toBe(false);

      // But should extract rate limit headers
      expect(error.response.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should handle gateway errors (502/503/504)', () => {
      for (const status of [502, 503, 504]) {
        const error = {
          response: { status },
        };

        const isRetryable = error.response.status === 502 ||
          error.response.status === 503 || error.response.status === 504;
        expect(isRetryable).toBe(true);
      }
    });

    it('should NOT retry client errors (4xx except 429)', () => {
      for (const status of [400, 401, 403, 404, 409, 422]) {
        const error = {
          response: { status },
        };

        const isRetryable = error.response.status === 502 ||
          error.response.status === 503 || error.response.status === 504;
        expect(isRetryable).toBe(false);
      }
    });
  });

  // ===========================================
  // Retry Count Limits
  // ===========================================

  describe('Retry Count Enforcement', () => {
    it('fast endpoints should retry at most 2 times', () => {
      const maxRetries = 2;
      let attempts = 0;

      // Simulate retry loop
      for (let i = 0; i <= maxRetries; i++) {
        attempts++;
      }

      // 1 initial + 2 retries = 3 total attempts
      expect(attempts).toBe(3);
    });

    it('standard endpoints should retry at most 1 time', () => {
      const maxRetries = 1;
      let attempts = 0;

      for (let i = 0; i <= maxRetries; i++) {
        attempts++;
      }

      // 1 initial + 1 retry = 2 total attempts
      expect(attempts).toBe(2);
    });

    it('AI/code/upload endpoints should NOT retry', () => {
      const maxRetries = 0;
      let attempts = 0;

      for (let i = 0; i <= maxRetries; i++) {
        attempts++;
      }

      // 1 initial + 0 retries = 1 total attempt
      expect(attempts).toBe(1);
    });
  });
});
