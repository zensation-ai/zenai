/**
 * Generic Circuit Breaker
 *
 * Implements the circuit breaker pattern with:
 * - Three states: CLOSED (normal), OPEN (failing fast), HALF_OPEN (probing recovery)
 * - Sliding window failure tracking with configurable window size
 * - Optional fallback function invoked when the circuit is OPEN
 * - EventEmitter for state transition notifications
 *
 * @module utils/circuit-breaker
 */

import { EventEmitter } from 'events';
import { logger } from './logger';

// ===========================
// Types
// ===========================

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Human-readable name for this breaker (used in logs/stats) */
  name?: string;
  /** Number of failures within windowMs to trip the breaker (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting a probe in HALF_OPEN state (default: 60_000) */
  resetTimeout?: number;
  /**
   * Sliding window size in ms — failures older than this are discarded.
   * Defaults to resetTimeout when not specified.
   */
  windowMs?: number;
  /** Optional async fallback called instead of the wrapped fn when OPEN */
  fallback?: <T>() => Promise<T>;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitBreakerState;
  failures: number;
  successCount: number;
  lastFailureAt: number | null;
  nextRetryAt: number | null;
}

// ===========================
// Implementation
// ===========================

export class CircuitBreaker extends EventEmitter {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly windowMs: number;
  private readonly fallback?: <T>() => Promise<T>;

  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  /** Timestamps of recent failures within the sliding window */
  private failureTimes: number[] = [];
  private successCount = 0;
  private openedAt: number | null = null;

  constructor(options: CircuitBreakerOptions) {
    super();
    this.name = options.name ?? 'circuit-breaker';
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60_000;
    this.windowMs = options.windowMs ?? this.resetTimeout;
    this.fallback = options.fallback;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /**
   * Execute `fn` through the circuit breaker.
   * - CLOSED: executes normally; failure increments window counter
   * - OPEN:   calls fallback (if any) or throws CircuitOpenError
   * - HALF_OPEN: allows one probe; success → CLOSED, failure → OPEN
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Evaluate current state (may transition OPEN → HALF_OPEN after timeout)
    const currentState = this.getState();

    if (currentState === CircuitBreakerState.OPEN) {
      if (this.fallback) {
        logger.debug(`[CircuitBreaker:${this.name}] OPEN — using fallback`);
        return this.fallback<T>();
      }
      throw new Error(`Circuit breaker is open for "${this.name}". Try again later.`);
    }

    // CLOSED or HALF_OPEN — attempt execution
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Returns the effective current state.
   * Automatically transitions from OPEN → HALF_OPEN once resetTimeout elapses.
   */
  getState(): CircuitBreakerState {
    if (
      this.state === CircuitBreakerState.OPEN &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.resetTimeout
    ) {
      this.transitionTo(CircuitBreakerState.HALF_OPEN);
    }
    return this.state;
  }

  /** Returns a snapshot of current breaker statistics */
  getStats(): CircuitBreakerStats {
    this.pruneWindow();
    const lastFailureAt = this.failureTimes.length > 0
      ? this.failureTimes[this.failureTimes.length - 1]
      : null;

    return {
      name: this.name,
      state: this.getState(),
      failures: this.failureTimes.length,
      successCount: this.successCount,
      lastFailureAt,
      nextRetryAt: this.openedAt !== null ? this.openedAt + this.resetTimeout : null,
    };
  }

  // ----------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------

  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Probe succeeded — close the circuit and clear window
      this.failureTimes = [];
      this.openedAt = null;
      this.transitionTo(CircuitBreakerState.CLOSED);
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Normal success — reset failure window
      this.failureTimes = [];
    }
  }

  private onFailure(): void {
    const now = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Probe failed — reopen immediately
      this.openedAt = now;
      this.failureTimes.push(now);
      this.transitionTo(CircuitBreakerState.OPEN);
      return;
    }

    // Record failure in sliding window
    this.failureTimes.push(now);
    this.pruneWindow();

    if (this.failureTimes.length >= this.failureThreshold) {
      this.openedAt = now;
      this.transitionTo(CircuitBreakerState.OPEN);
    }
  }

  /** Remove failure timestamps older than windowMs */
  private pruneWindow(): void {
    const cutoff = Date.now() - this.windowMs;
    this.failureTimes = this.failureTimes.filter(t => t > cutoff);
  }

  private transitionTo(next: CircuitBreakerState): void {
    if (this.state === next) return;

    const previous = this.state;
    this.state = next;

    logger.info(`[CircuitBreaker:${this.name}] ${previous} → ${next}`, {
      failures: this.failureTimes.length,
      failureThreshold: this.failureThreshold,
      operation: 'circuitBreakerTransition',
    });

    this.emit('stateChange', { from: previous, to: next });
  }
}
