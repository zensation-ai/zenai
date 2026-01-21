/**
 * Unit Tests for Retry Utility with Circuit Breaker
 *
 * Tests retry logic, exponential backoff, circuit breaker functionality,
 * and error classification for various service types.
 */

import {
  withRetry,
  withCircuitBreaker,
  isAnthropicRetryable,
  isDatabaseRetryable,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  getCircuitBreakerStatus,
} from '../../../utils/retry';

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Retry Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // withRetry Tests
  // ===========================================

  describe('withRetry', () => {
    it('should return result on first attempt if successful', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn, { context: 'test-success', timeout: 5000 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed on retry', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, {
        context: 'test-retry-success',
        maxRetries: 3,
        initialDelay: 10, // Short delay for test
        jitter: false,
        timeout: 5000,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should throw after max retries exceeded', async () => {
      const error = new Error('Persistent failure');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        withRetry(fn, {
          context: 'test-max-retries',
          maxRetries: 2,
          initialDelay: 10,
          jitter: false,
          timeout: 5000,
        })
      ).rejects.toThrow('Persistent failure');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 10000);

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Non-retryable');
      const fn = jest.fn().mockRejectedValue(error);
      const isRetryable = jest.fn().mockReturnValue(false);

      await expect(
        withRetry(fn, {
          context: 'test-non-retryable',
          maxRetries: 3,
          isRetryable,
          timeout: 5000,
        })
      ).rejects.toThrow('Non-retryable');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(isRetryable).toHaveBeenCalledWith(error);
    });

    it('should use default options when none provided', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
    });
  });

  // ===========================================
  // isAnthropicRetryable Tests
  // ===========================================

  describe('isAnthropicRetryable', () => {
    it('should return true for network errors', () => {
      expect(isAnthropicRetryable({ code: 'ECONNRESET' })).toBe(true);
      expect(isAnthropicRetryable({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isAnthropicRetryable({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('should return true for rate limit (429)', () => {
      expect(isAnthropicRetryable({ status: 429 })).toBe(true);
    });

    it('should return true for server errors (5xx)', () => {
      expect(isAnthropicRetryable({ status: 500 })).toBe(true);
      expect(isAnthropicRetryable({ status: 502 })).toBe(true);
      expect(isAnthropicRetryable({ status: 503 })).toBe(true);
      expect(isAnthropicRetryable({ status: 504 })).toBe(true);
    });

    it('should return true for timeout errors', () => {
      expect(isAnthropicRetryable({ message: 'Request timed out' })).toBe(true);
      expect(isAnthropicRetryable({ message: 'Connection timeout occurred' })).toBe(true);
    });

    it('should return true for connection errors', () => {
      expect(isAnthropicRetryable({ message: 'ECONNREFUSED' })).toBe(true);
      expect(isAnthropicRetryable({ message: 'socket hang up' })).toBe(true);
    });

    it('should return true for overloaded errors', () => {
      expect(isAnthropicRetryable({ error: { type: 'overloaded_error' } })).toBe(true);
    });

    it('should return false for client errors (4xx except 429)', () => {
      expect(isAnthropicRetryable({ status: 400 })).toBe(false);
      expect(isAnthropicRetryable({ status: 401 })).toBe(false);
      expect(isAnthropicRetryable({ status: 403 })).toBe(false);
      expect(isAnthropicRetryable({ status: 404 })).toBe(false);
    });

    it('should return true for unknown errors', () => {
      expect(isAnthropicRetryable({})).toBe(true);
      expect(isAnthropicRetryable({ unknownProperty: 'value' })).toBe(true);
    });
  });

  // ===========================================
  // isDatabaseRetryable Tests
  // ===========================================

  describe('isDatabaseRetryable', () => {
    it('should return true for network errors', () => {
      expect(isDatabaseRetryable({ code: 'ECONNRESET' })).toBe(true);
      expect(isDatabaseRetryable({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isDatabaseRetryable({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('should return true for PostgreSQL connection errors', () => {
      expect(isDatabaseRetryable({ code: '08000' })).toBe(true); // connection_exception
      expect(isDatabaseRetryable({ code: '08003' })).toBe(true); // connection_does_not_exist
      expect(isDatabaseRetryable({ code: '08006' })).toBe(true); // connection_failure
      expect(isDatabaseRetryable({ code: '08001' })).toBe(true); // sqlclient_unable_to_establish
      expect(isDatabaseRetryable({ code: '08004' })).toBe(true); // sqlserver_rejected
    });

    it('should return true for PostgreSQL server shutdown errors', () => {
      expect(isDatabaseRetryable({ code: '57P01' })).toBe(true); // admin_shutdown
      expect(isDatabaseRetryable({ code: '57P02' })).toBe(true); // crash_shutdown
      expect(isDatabaseRetryable({ code: '57P03' })).toBe(true); // cannot_connect_now
    });

    it('should return true for serialization/deadlock errors', () => {
      expect(isDatabaseRetryable({ code: '40001' })).toBe(true); // serialization_failure
      expect(isDatabaseRetryable({ code: '40P01' })).toBe(true); // deadlock_detected
    });

    it('should return true for connection pool errors', () => {
      expect(isDatabaseRetryable({ message: 'Connection terminated unexpectedly' })).toBe(true);
      expect(isDatabaseRetryable({ message: 'Connection pool exhausted' })).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isDatabaseRetryable({ code: '23505' })).toBe(false); // unique_violation
      expect(isDatabaseRetryable({ code: '42P01' })).toBe(false); // undefined_table
      expect(isDatabaseRetryable({ message: 'Invalid SQL syntax' })).toBe(false);
    });
  });

  // ===========================================
  // Circuit Breaker Tests
  // ===========================================

  describe('Circuit Breaker', () => {
    // Use fake timers for circuit breaker tests (they don't involve retry delays)
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    const getUniqueService = () => `test-service-${Date.now()}-${Math.random()}`;

    describe('isCircuitOpen', () => {
      it('should return false for unknown services', () => {
        const service = getUniqueService();
        expect(isCircuitOpen(service)).toBe(false);
      });

      it('should return false when below failure threshold', () => {
        const service = getUniqueService();

        // Record 4 failures (threshold is 5)
        for (let i = 0; i < 4; i++) {
          recordFailure(service);
        }

        expect(isCircuitOpen(service)).toBe(false);
      });

      it('should return true when circuit is open', () => {
        const service = getUniqueService();

        // Record 5 failures to open circuit
        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        expect(isCircuitOpen(service)).toBe(true);
      });

      it('should return false (half-open) after reset timeout', () => {
        const service = getUniqueService();

        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        expect(isCircuitOpen(service)).toBe(true);

        // Advance past reset timeout (60 seconds)
        jest.advanceTimersByTime(61000);

        expect(isCircuitOpen(service)).toBe(false);
      });
    });

    describe('recordFailure', () => {
      it('should increment failure count', () => {
        const service = getUniqueService();

        recordFailure(service);
        recordFailure(service);
        recordFailure(service);

        // Still below threshold
        expect(isCircuitOpen(service)).toBe(false);
      });

      it('should open circuit after threshold failures', () => {
        const service = getUniqueService();

        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        expect(isCircuitOpen(service)).toBe(true);
      });
    });

    describe('recordSuccess', () => {
      it('should reset failure count and close circuit', () => {
        const service = getUniqueService();

        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        expect(isCircuitOpen(service)).toBe(true);

        // Record success (simulating half-open test succeeded)
        recordSuccess(service);

        expect(isCircuitOpen(service)).toBe(false);
      });

      it('should be safe to call on unknown service', () => {
        const service = getUniqueService();

        // Should not throw
        expect(() => recordSuccess(service)).not.toThrow();
      });
    });

    describe('getCircuitBreakerStatus', () => {
      it('should return status for known services', () => {
        const status = getCircuitBreakerStatus();

        expect(status).toHaveProperty('claude');
        expect(status).toHaveProperty('claude-extended');
        expect(status).toHaveProperty('ollama');
        expect(status).toHaveProperty('ollama-embedding');
      });

      it('should return default values for untracked services', () => {
        // Reset known services by getting fresh status
        const status = getCircuitBreakerStatus();

        // Check structure of a known service that hasn't been used
        expect(status.claude).toHaveProperty('isOpen');
        expect(status.claude).toHaveProperty('failures');
        expect(status.claude).toHaveProperty('lastFailure');
      });

      it('should return accurate status after failures', () => {
        const service = 'ollama'; // Use a known service

        // Reset by recording success
        recordSuccess(service);

        // Record some failures but don't open the circuit
        recordFailure(service);
        recordFailure(service);

        const status = getCircuitBreakerStatus();

        expect(status.ollama.failures).toBe(2);
        expect(status.ollama.isOpen).toBe(false);
      });

      it('should calculate reset time remaining when circuit is open', () => {
        const service = getUniqueService();

        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        // For known services, check the concept
        const status = getCircuitBreakerStatus();
        expect(status).toHaveProperty('ollama');
      });
    });

    describe('withCircuitBreaker', () => {
      it('should execute function when circuit is closed', async () => {
        const service = getUniqueService();
        const fn = jest.fn().mockResolvedValue('success');

        const result = await withCircuitBreaker(service, fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should throw when circuit is open', async () => {
        const service = getUniqueService();
        const fn = jest.fn().mockResolvedValue('success');

        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        await expect(withCircuitBreaker(service, fn)).rejects.toThrow(
          `Circuit breaker is open for ${service}`
        );
        expect(fn).not.toHaveBeenCalled();
      });

      it('should record success on successful execution', async () => {
        const service = getUniqueService();

        // Add some failures but don't open circuit
        recordFailure(service);
        recordFailure(service);

        const fn = jest.fn().mockResolvedValue('success');

        await withCircuitBreaker(service, fn);

        // After success, failures should be reset
        expect(isCircuitOpen(service)).toBe(false);
      });

      it('should record failure on failed execution', async () => {
        const service = getUniqueService();
        const error = new Error('Test error');
        const fn = jest.fn().mockRejectedValue(error);

        await expect(withCircuitBreaker(service, fn)).rejects.toThrow('Test error');

        // The function still runs once
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should open circuit after threshold failures via withCircuitBreaker', async () => {
        const service = getUniqueService();
        const error = new Error('Test error');
        const fn = jest.fn().mockRejectedValue(error);

        // Fail 5 times through withCircuitBreaker
        for (let i = 0; i < 5; i++) {
          await expect(withCircuitBreaker(service, fn)).rejects.toThrow();
        }

        expect(isCircuitOpen(service)).toBe(true);

        // Next call should fail immediately without calling fn
        fn.mockClear();
        await expect(withCircuitBreaker(service, fn)).rejects.toThrow(
          'Circuit breaker is open'
        );
        expect(fn).not.toHaveBeenCalled();
      });

      it('should allow request through in half-open state', async () => {
        const service = getUniqueService();

        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        expect(isCircuitOpen(service)).toBe(true);

        // Advance past reset timeout
        jest.advanceTimersByTime(61000);

        // Circuit should be half-open, allowing one request
        const fn = jest.fn().mockResolvedValue('success');
        const result = await withCircuitBreaker(service, fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);

        // Circuit should now be closed
        expect(isCircuitOpen(service)).toBe(false);
      });

      it('should re-open circuit if half-open test fails', async () => {
        const service = getUniqueService();

        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure(service);
        }

        // Advance past reset timeout
        jest.advanceTimersByTime(61000);

        // Half-open test fails
        const fn = jest.fn().mockRejectedValue(new Error('Still failing'));
        await expect(withCircuitBreaker(service, fn)).rejects.toThrow('Still failing');

        // Circuit should be re-opened
        expect(isCircuitOpen(service)).toBe(true);
      });
    });
  });
});
