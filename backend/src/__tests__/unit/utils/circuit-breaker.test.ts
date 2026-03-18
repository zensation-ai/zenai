/**
 * Circuit Breaker Tests
 *
 * Tests for the generic CircuitBreaker class with sliding window failure tracking,
 * CLOSED/OPEN/HALF_OPEN state transitions, fallback support, and EventEmitter.
 */

import { CircuitBreaker, CircuitBreakerState } from '../../../utils/circuit-breaker';

// Helper to advance fake timers cleanly
function advanceTime(ms: number): void {
  jest.advanceTimersByTime(ms);
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Initial State
  // -----------------------------------------------------------------------

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('getStats returns zero counters initially', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });
      const stats = cb.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // CLOSED state — normal operation
  // -----------------------------------------------------------------------

  describe('CLOSED state', () => {
    it('stays CLOSED below failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      // 2 failures — below threshold of 3
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('passes through successful calls', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });
      const result = await cb.execute(() => Promise.resolve(42));
      expect(result).toBe(42);
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('resets failure count after a successful call', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      // 2 failures
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // 1 success → resets failures
      await cb.execute(() => Promise.resolve('ok'));

      const stats = cb.getStats();
      expect(stats.failures).toBe(0);
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  // -----------------------------------------------------------------------
  // OPEN state — circuit trips
  // -----------------------------------------------------------------------

  describe('OPEN state', () => {
    it('opens after reaching the failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('rejects immediately (circuit open error) in OPEN state', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Next call should fail fast without calling the wrapped function
      const spy = jest.fn(() => Promise.resolve('should not be called'));
      await expect(cb.execute(spy)).rejects.toThrow(/circuit.*open/i);
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls fallback function in OPEN state when provided', async () => {
      const fallback = jest.fn(() => Promise.resolve('fallback-value'));
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000, fallback });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      const result = await cb.execute(() => Promise.resolve('primary'));
      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('reports correct stats when OPEN', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      const stats = cb.getStats();
      expect(stats.state).toBe(CircuitBreakerState.OPEN);
      expect(stats.failures).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // HALF_OPEN state — probe after reset timeout
  // -----------------------------------------------------------------------

  describe('HALF_OPEN state', () => {
    it('transitions to HALF_OPEN after resetTimeout elapses', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

      advanceTime(60_001);

      // Triggering state check by reading state
      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('closes after a successful HALF_OPEN request', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      advanceTime(60_001);
      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await cb.execute(() => Promise.resolve('probe-ok'));
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('reopens after a failed HALF_OPEN request', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      advanceTime(60_001);
      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      await expect(cb.execute(() => Promise.reject(new Error('probe fail')))).rejects.toThrow('probe fail');
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  // -----------------------------------------------------------------------
  // Sliding window — old failures expire
  // -----------------------------------------------------------------------

  describe('sliding window', () => {
    it('clears old failures outside the sliding window', async () => {
      const windowMs = 10_000;
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000, windowMs });

      // 2 failures
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Advance past the window so those failures expire
      advanceTime(windowMs + 1);

      // 2 more failures — should still be CLOSED because old ones expired
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  // -----------------------------------------------------------------------
  // EventEmitter — state change events
  // -----------------------------------------------------------------------

  describe('events', () => {
    it('emits stateChange event when transitioning to OPEN', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });
      const handler = jest.fn();
      cb.on('stateChange', handler);

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      expect(handler).toHaveBeenCalledWith({
        from: CircuitBreakerState.CLOSED,
        to: CircuitBreakerState.OPEN,
      });
    });

    it('emits stateChange event when transitioning to CLOSED after probe success', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });
      const handler = jest.fn();
      cb.on('stateChange', handler);

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      advanceTime(60_001);
      await cb.execute(() => Promise.resolve('ok'));

      // Check that CLOSED transition was emitted
      const closedEvent = handler.mock.calls.find(
        ([arg]) => arg.to === CircuitBreakerState.CLOSED
      );
      expect(closedEvent).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // getStats — correctness
  // -----------------------------------------------------------------------

  describe('getStats', () => {
    it('returns correct data across all fields', async () => {
      const cb = new CircuitBreaker({ name: 'test-cb', failureThreshold: 3, resetTimeout: 60_000 });

      await cb.execute(() => Promise.resolve('ok'));
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      const stats = cb.getStats();
      expect(stats.name).toBe('test-cb');
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failures).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(typeof stats.lastFailureAt).toBe('number');
    });
  });
});
