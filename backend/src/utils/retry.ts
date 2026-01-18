/**
 * Retry Utility with Exponential Backoff
 *
 * Provides robust retry logic for external API calls (Claude, DB, etc.)
 * to improve system stability and handle transient failures.
 */

import { logger } from './logger';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Timeout for each attempt in ms (default: 30000) */
  timeout?: number;
  /** Function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: any) => boolean;
  /** Context for logging */
  context?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  timeout: 30000,
  isRetryable: () => true,
  context: 'retry',
};

/**
 * Calculates delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number,
  jitter: boolean
): number {
  // Exponential backoff: delay = initialDelay * (multiplier ^ attempt)
  let delay = initialDelay * Math.pow(multiplier, attempt);

  // Cap at maxDelay
  delay = Math.min(delay, maxDelay);

  // Add random jitter (±25%)
  if (jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Wraps a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${context}: Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Executes an async function with retry logic and exponential backoff
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => claudeClient.messages.create({ ... }),
 *   { maxRetries: 3, context: 'claude-api' }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Apply timeout to each attempt
      const result = await withTimeout(fn(), opts.timeout, opts.context);

      // Log success after retries
      if (attempt > 0) {
        logger.info(`${opts.context}: Succeeded after ${attempt} retries`);
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // Check if we should retry
      const isRetryable = opts.isRetryable(error);
      const hasRetriesLeft = attempt < opts.maxRetries;

      if (!isRetryable || !hasRetriesLeft) {
        logger.error(`${opts.context}: Failed after ${attempt + 1} attempts`, error, {
          isRetryable,
          hasRetriesLeft,
          errorMessage: error.message,
        });
        break;
      }

      // Calculate delay for next retry
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier,
        opts.jitter
      );

      logger.warn(`${opts.context}: Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
        error: error.message,
        nextAttempt: attempt + 2,
        delay,
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`${opts.context}: All retry attempts failed`);
}

/**
 * Determines if an Anthropic API error is retryable
 */
export function isAnthropicRetryable(error: any): boolean {
  // Network errors are retryable
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // Rate limit errors (429) are retryable
  if (error.status === 429) {
    return true;
  }

  // Server errors (5xx) are retryable
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // Timeout errors are retryable
  if (error.message?.includes('timed out') || error.message?.includes('timeout')) {
    return true;
  }

  // Connection errors are retryable
  if (error.message?.includes('ECONNREFUSED') || error.message?.includes('socket hang up')) {
    return true;
  }

  // API overloaded errors are retryable
  if (error.error?.type === 'overloaded_error') {
    return true;
  }

  // Don't retry client errors (4xx except 429)
  if (error.status >= 400 && error.status < 500 && error.status !== 429) {
    return false;
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Determines if a database error is retryable
 */
export function isDatabaseRetryable(error: any): boolean {
  // Connection errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // PostgreSQL specific retryable errors
  const retryableCodes = [
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    '40001', // serialization_failure
    '40P01', // deadlock_detected
  ];

  if (retryableCodes.includes(error.code)) {
    return true;
  }

  // Connection pool errors
  if (error.message?.includes('Connection terminated') ||
      error.message?.includes('Connection pool')) {
    return true;
  }

  return false;
}

/**
 * Circuit Breaker state for preventing cascading failures
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreakers: Map<string, CircuitBreakerState> = new Map();

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,    // Open circuit after 5 failures
  resetTimeout: 60000,    // Try again after 60 seconds
};

/**
 * Checks if circuit breaker allows the request
 */
export function isCircuitOpen(service: string): boolean {
  const state = circuitBreakers.get(service);
  if (!state) return false;

  if (state.isOpen) {
    // Check if reset timeout has passed
    if (Date.now() - state.lastFailure > CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      // Half-open: allow one request through
      logger.info(`Circuit breaker half-open for ${service}`);
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Records a failure for circuit breaker
 */
export function recordFailure(service: string): void {
  const state = circuitBreakers.get(service) || { failures: 0, lastFailure: 0, isOpen: false };
  state.failures++;
  state.lastFailure = Date.now();

  if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    state.isOpen = true;
    logger.warn(`Circuit breaker opened for ${service}`, { failures: state.failures });
  }

  circuitBreakers.set(service, state);
}

/**
 * Records a success, resets circuit breaker
 */
export function recordSuccess(service: string): void {
  const state = circuitBreakers.get(service);
  if (state) {
    state.failures = 0;
    state.isOpen = false;
    circuitBreakers.set(service, state);
  }
}

/**
 * Wraps a function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  service: string,
  fn: () => Promise<T>
): Promise<T> {
  if (isCircuitOpen(service)) {
    throw new Error(`Circuit breaker is open for ${service}. Service temporarily unavailable.`);
  }

  try {
    const result = await fn();
    recordSuccess(service);
    return result;
  } catch (error) {
    recordFailure(service);
    throw error;
  }
}

/**
 * Get circuit breaker status for all services
 * Useful for health checks and monitoring
 */
export function getCircuitBreakerStatus(): Record<string, {
  isOpen: boolean;
  failures: number;
  lastFailure: number | null;
  timeSinceLastFailure: number | null;
  resetTimeRemaining: number | null;
}> {
  const status: Record<string, {
    isOpen: boolean;
    failures: number;
    lastFailure: number | null;
    timeSinceLastFailure: number | null;
    resetTimeRemaining: number | null;
  }> = {};

  // Always include known services even if no state exists
  const knownServices = ['claude', 'claude-extended'];

  for (const service of knownServices) {
    const state = circuitBreakers.get(service);
    if (state) {
      const timeSinceLastFailure = state.lastFailure ? Date.now() - state.lastFailure : null;
      const resetTimeRemaining = state.isOpen && state.lastFailure
        ? Math.max(0, CIRCUIT_BREAKER_CONFIG.resetTimeout - (Date.now() - state.lastFailure))
        : null;

      status[service] = {
        isOpen: state.isOpen,
        failures: state.failures,
        lastFailure: state.lastFailure || null,
        timeSinceLastFailure,
        resetTimeRemaining,
      };
    } else {
      status[service] = {
        isOpen: false,
        failures: 0,
        lastFailure: null,
        timeSinceLastFailure: null,
        resetTimeRemaining: null,
      };
    }
  }

  return status;
}
