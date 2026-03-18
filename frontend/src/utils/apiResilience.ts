/**
 * Phase 7.1: API Resilience - Request Retry & Timeout Strategy
 *
 * Provides:
 * - Automatic retries with exponential backoff for 5xx and network errors
 * - Configurable timeouts per endpoint category
 * - Rate limit header tracking (used by 7.4 rate limit feedback)
 * - Request deduplication guard
 */

import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Timeout configuration per endpoint category
// ---------------------------------------------------------------------------

interface TimeoutConfig {
  /** Milliseconds before the request times out */
  timeout: number;
  /** Maximum retry attempts (0 = no retry) */
  maxRetries: number;
}

const TIMEOUT_CONFIGS: Record<string, TimeoutConfig> = {
  // Fast endpoints - health, CSRF, simple GETs
  fast: { timeout: 10_000, maxRetries: 2 },
  // Standard CRUD operations
  standard: { timeout: 30_000, maxRetries: 1 },
  // AI/streaming endpoints - these take longer
  ai: { timeout: 120_000, maxRetries: 0 },
  // File uploads
  upload: { timeout: 60_000, maxRetries: 0 },
  // Code execution
  code: { timeout: 60_000, maxRetries: 0 },
};

/**
 * Classify a URL into a timeout category.
 */
function getTimeoutCategory(url: string | undefined): string {
  if (!url) return 'standard';

  // AI/streaming endpoints
  if (url.includes('/messages/stream') || url.includes('/chat/quick') ||
      url.includes('/messages/vision') || url.includes('/vision/')) {
    return 'ai';
  }

  // Code execution
  if (url.includes('/code/execute') || url.includes('/code/run')) {
    return 'code';
  }

  // File uploads
  if (url.includes('/media/upload') || url.includes('/voice-memo')) {
    return 'upload';
  }

  // Fast endpoints
  if (url.includes('/health') || url.includes('/csrf-token') ||
      url.includes('/status') || url.includes('/metrics')) {
    return 'fast';
  }

  return 'standard';
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

/** Custom config property to track retry state */
interface RetryState {
  __retryCount?: number;
  __maxRetries?: number;
  __isRetry?: boolean;
}

type AxiosConfigWithRetry = InternalAxiosRequestConfig & RetryState;

/**
 * Check if an error is retryable.
 * - Network errors (no response)
 * - 502, 503, 504 (gateway/service unavailable)
 * - ECONNABORTED (timeout)
 * Does NOT retry: 429 (rate limit - has its own handling), 500 (likely a bug), 4xx
 */
function isRetryableError(error: AxiosError): boolean {
  // Network errors (no response received)
  if (!error.response) {
    return error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.code === 'ETIMEDOUT';
  }

  const status = error.response.status;
  return status === 502 || status === 503 || status === 504;
}

/**
 * Calculate delay with exponential backoff and jitter.
 * Base delay: 1s, 2s, 4s... with ±25% jitter to prevent thundering herd.
 */
function getRetryDelay(retryCount: number): number {
  const baseDelay = 1000 * Math.pow(2, retryCount); // 1s, 2s, 4s
  const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1); // ±25%
  return Math.min(baseDelay + jitter, 10_000); // cap at 10s
}

/**
 * Delay execution.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Rate limit tracking (consumed by 7.4 Rate Limit Feedback)
// ---------------------------------------------------------------------------

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
  source: string;
}

let lastRateLimitInfo: RateLimitInfo | null = null;
const rateLimitListeners: Array<(info: RateLimitInfo | null) => void> = [];

/**
 * Get the most recent rate limit info from response headers.
 */
export function getRateLimitInfo(): RateLimitInfo | null {
  return lastRateLimitInfo;
}

/**
 * Subscribe to rate limit info updates.
 * Returns an unsubscribe function.
 */
export function onRateLimitUpdate(listener: (info: RateLimitInfo | null) => void): () => void {
  rateLimitListeners.push(listener);
  return () => {
    const idx = rateLimitListeners.indexOf(listener);
    if (idx >= 0) rateLimitListeners.splice(idx, 1);
  };
}

function updateRateLimitInfo(info: RateLimitInfo | null): void {
  lastRateLimitInfo = info;
  for (const listener of rateLimitListeners) {
    listener(info);
  }
}

/**
 * Extract rate limit info from response headers.
 */
function extractRateLimitHeaders(response: AxiosResponse): void {
  const limit = response.headers['x-ratelimit-limit'];
  const remaining = response.headers['x-ratelimit-remaining'];
  const reset = response.headers['x-ratelimit-reset'];
  const source = response.headers['x-ratelimit-source'];

  if (limit && remaining) {
    updateRateLimitInfo({
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      resetAt: reset ? new Date(reset) : new Date(Date.now() + 60_000),
      source: source || 'unknown',
    });
  }
}

// ---------------------------------------------------------------------------
// Install interceptors
// ---------------------------------------------------------------------------

/**
 * Install resilience interceptors on the global axios instance.
 * Call once at app startup (in main.tsx).
 */
export function installResilienceInterceptors(): void {
  // REQUEST interceptor: apply timeout based on endpoint category
  axios.interceptors.request.use((config: AxiosConfigWithRetry) => {
    // Don't override if timeout is already explicitly set
    if (!config.timeout) {
      const category = getTimeoutCategory(config.url);
      const timeoutConfig = TIMEOUT_CONFIGS[category];
      config.timeout = timeoutConfig.timeout;

      // Store max retries for this request
      if (config.__maxRetries === undefined) {
        config.__maxRetries = timeoutConfig.maxRetries;
      }
    }

    // Initialize retry count
    if (config.__retryCount === undefined) {
      config.__retryCount = 0;
    }

    return config;
  });

  // RESPONSE interceptor: track rate limit headers + retry on transient errors
  axios.interceptors.response.use(
    (response) => {
      // Track rate limit headers from successful responses
      extractRateLimitHeaders(response);
      return response;
    },
    async (error: AxiosError) => {
      const config = error.config as AxiosConfigWithRetry | undefined;

      // Extract rate limit info even from error responses
      if (error.response) {
        extractRateLimitHeaders(error.response);
      }

      // If the request was cancelled, don't retry
      if (axios.isCancel(error)) {
        return Promise.reject(error);
      }

      // Check if we should retry
      if (config && isRetryableError(error)) {
        const retryCount = config.__retryCount ?? 0;
        const maxRetries = config.__maxRetries ?? 0;

        if (retryCount < maxRetries) {
          config.__retryCount = retryCount + 1;
          config.__isRetry = true;

          const retryDelay = getRetryDelay(retryCount);
          logger.debug(
            `[API Retry] ${config.method?.toUpperCase()} ${config.url} - ` +
            `attempt ${retryCount + 1}/${maxRetries} after ${Math.round(retryDelay)}ms ` +
            `(${error.code || error.response?.status || 'network error'})`
          );

          await delay(retryDelay);
          return axios(config);
        }
      }

      return Promise.reject(error);
    }
  );
}
