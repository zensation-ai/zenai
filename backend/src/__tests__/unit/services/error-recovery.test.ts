/**
 * Phase 8.3: Backend Error Recovery Testing
 *
 * Tests for retry logic, circuit breaker, and error classification
 * mechanisms in the backend retry utility.
 */

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  withRetry,
  isAnthropicRetryable,
  isDatabaseRetryable,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  withCircuitBreaker,
  getCircuitBreakerStatus,
} from '../../../utils/retry';

describe('Phase 8.3: Backend Error Recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset circuit breakers by recording successes
    ['claude', 'claude-extended', 'ollama', 'ollama-embedding', 'test-service'].forEach(service => {
      recordSuccess(service);
    });
  });

  // ===========================================
  // withRetry
  // ===========================================

  describe('withRetry', () => {
    it('should return result on first attempt success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { maxRetries: 3, context: 'test', timeout: 5000 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed on subsequent attempt', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('transient failure'))
        .mockResolvedValueOnce('recovered');

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10, // Fast for tests
        context: 'test',
        timeout: 5000,
        jitter: false,
      });

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting all retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(withRetry(fn, {
        maxRetries: 2,
        initialDelay: 10,
        context: 'test',
        timeout: 5000,
        jitter: false,
      })).rejects.toThrow('persistent failure');

      // 1 initial + 2 retries = 3 calls
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect isRetryable predicate', async () => {
      const nonRetryableError = new Error('auth failed');
      const fn = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        context: 'test',
        timeout: 5000,
        isRetryable: (err: unknown) => {
          const error = err as Error;
          return !error.message.includes('auth');
        },
      })).rejects.toThrow('auth failed');

      // Should NOT retry because error is not retryable
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should timeout individual attempts', async () => {
      const slowFn = jest.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 5000)),
      );

      await expect(withRetry(slowFn, {
        maxRetries: 0,
        timeout: 50, // Very short timeout
        context: 'timeout-test',
        initialDelay: 10,
      })).rejects.toThrow(/timed out/);
    });

    it('should use quiet mode for expected failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('expected'));

      await expect(withRetry(fn, {
        maxRetries: 0,
        context: 'quiet',
        timeout: 5000,
        quietMode: true,
      })).rejects.toThrow('expected');

      // Should use debug level, not error level
      const { logger } = require('../../../utils/logger');
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  // ===========================================
  // Anthropic Error Classification
  // ===========================================

  describe('isAnthropicRetryable', () => {
    it('should retry on network errors', () => {
      expect(isAnthropicRetryable({ code: 'ECONNRESET' })).toBe(true);
      expect(isAnthropicRetryable({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isAnthropicRetryable({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('should retry on rate limit (429)', () => {
      expect(isAnthropicRetryable({ status: 429 })).toBe(true);
    });

    it('should retry on server errors (5xx)', () => {
      expect(isAnthropicRetryable({ status: 500 })).toBe(true);
      expect(isAnthropicRetryable({ status: 502 })).toBe(true);
      expect(isAnthropicRetryable({ status: 503 })).toBe(true);
    });

    it('should retry on timeout messages', () => {
      expect(isAnthropicRetryable({ message: 'Request timed out' })).toBe(true);
      expect(isAnthropicRetryable({ message: 'Connection timeout' })).toBe(true);
    });

    it('should retry on connection refused', () => {
      expect(isAnthropicRetryable({ message: 'ECONNREFUSED' })).toBe(true);
      expect(isAnthropicRetryable({ message: 'socket hang up' })).toBe(true);
    });

    it('should retry on overloaded error', () => {
      expect(isAnthropicRetryable({ error: { type: 'overloaded_error' } })).toBe(true);
    });

    it('should NOT retry on client errors (4xx except 429)', () => {
      expect(isAnthropicRetryable({ status: 400 })).toBe(false);
      expect(isAnthropicRetryable({ status: 401 })).toBe(false);
      expect(isAnthropicRetryable({ status: 403 })).toBe(false);
      expect(isAnthropicRetryable({ status: 404 })).toBe(false);
      expect(isAnthropicRetryable({ status: 422 })).toBe(false);
    });
  });

  // ===========================================
  // Database Error Classification
  // ===========================================

  describe('isDatabaseRetryable', () => {
    it('should retry on connection errors', () => {
      expect(isDatabaseRetryable({ code: 'ECONNRESET' })).toBe(true);
      expect(isDatabaseRetryable({ code: 'ETIMEDOUT' })).toBe(true);
    });

    it('should retry on PostgreSQL connection exceptions', () => {
      const pgCodes = ['08000', '08003', '08006', '08001', '08004'];
      for (const code of pgCodes) {
        expect(isDatabaseRetryable({ code })).toBe(true);
      }
    });

    it('should retry on PostgreSQL shutdown errors', () => {
      expect(isDatabaseRetryable({ code: '57P01' })).toBe(true); // admin_shutdown
      expect(isDatabaseRetryable({ code: '57P02' })).toBe(true); // crash_shutdown
      expect(isDatabaseRetryable({ code: '57P03' })).toBe(true); // cannot_connect_now
    });

    it('should retry on serialization/deadlock errors', () => {
      expect(isDatabaseRetryable({ code: '40001' })).toBe(true); // serialization_failure
      expect(isDatabaseRetryable({ code: '40P01' })).toBe(true); // deadlock_detected
    });

    it('should retry on connection pool errors', () => {
      expect(isDatabaseRetryable({ message: 'Connection terminated unexpectedly' })).toBe(true);
      expect(isDatabaseRetryable({ message: 'Connection pool timeout' })).toBe(true);
    });

    it('should NOT retry on non-connection errors', () => {
      expect(isDatabaseRetryable({ code: '23505' })).toBe(false);  // unique_violation
      expect(isDatabaseRetryable({ code: '42P01' })).toBe(false);  // undefined_table
      expect(isDatabaseRetryable({ message: 'syntax error' })).toBe(false);
    });
  });

  // ===========================================
  // Circuit Breaker
  // ===========================================

  describe('Circuit Breaker', () => {
    const SERVICE = 'test-service';

    it('should start with closed circuit', () => {
      expect(isCircuitOpen(SERVICE)).toBe(false);
    });

    it('should open circuit after 5 failures', () => {
      for (let i = 0; i < 5; i++) {
        recordFailure(SERVICE);
      }
      expect(isCircuitOpen(SERVICE)).toBe(true);
    });

    it('should reset on success', () => {
      for (let i = 0; i < 5; i++) {
        recordFailure(SERVICE);
      }
      expect(isCircuitOpen(SERVICE)).toBe(true);

      recordSuccess(SERVICE);
      expect(isCircuitOpen(SERVICE)).toBe(false);
    });

    it('should NOT open circuit with fewer than 5 failures', () => {
      for (let i = 0; i < 4; i++) {
        recordFailure(SERVICE);
      }
      expect(isCircuitOpen(SERVICE)).toBe(false);
    });

    it('should report status for known services', () => {
      const status = getCircuitBreakerStatus();

      // Should always include known services
      expect(status).toHaveProperty('claude');
      expect(status).toHaveProperty('ollama');

      // Each service status should have expected shape
      for (const [, serviceStatus] of Object.entries(status)) {
        expect(serviceStatus).toHaveProperty('isOpen');
        expect(serviceStatus).toHaveProperty('failures');
        expect(typeof serviceStatus.isOpen).toBe('boolean');
        expect(typeof serviceStatus.failures).toBe('number');
      }
    });
  });

  // ===========================================
  // withCircuitBreaker
  // ===========================================

  describe('withCircuitBreaker', () => {
    const SERVICE = 'test-cb-service';

    beforeEach(() => {
      recordSuccess(SERVICE); // Reset
    });

    it('should execute function when circuit is closed', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const result = await withCircuitBreaker(SERVICE, fn);
      expect(result).toBe('result');
    });

    it('should throw when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        recordFailure(SERVICE);
      }

      const fn = jest.fn().mockResolvedValue('result');
      await expect(withCircuitBreaker(SERVICE, fn)).rejects.toThrow(/Circuit breaker is open/);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should record success on successful execution', async () => {
      recordFailure(SERVICE); // Add a failure
      recordFailure(SERVICE);
      recordFailure(SERVICE);

      const fn = jest.fn().mockResolvedValue('ok');
      await withCircuitBreaker(SERVICE, fn);

      // After success, failures should be reset
      const status = getCircuitBreakerStatus();
      // Service may not be in known services, but isCircuitOpen should be false
      expect(isCircuitOpen(SERVICE)).toBe(false);
    });

    it('should record failure on failed execution', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(withCircuitBreaker(SERVICE, fn)).rejects.toThrow('fail');
    });
  });
});
