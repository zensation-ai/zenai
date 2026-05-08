/**
 * Provider Registry — shared error classification, timeout enforcement,
 * and circuit breaker for STT and TTS provider chains.
 *
 * Sprint 1.13: Voice-Realtime Production-Hardening.
 *
 * Failover policy (sprint spec): automatically fall over on
 *   - HTTP 503 (Service Unavailable)
 *   - HTTP 429 (Too Many Requests / Rate Limit)
 *   - Timeout > 5 s
 *   - Generic 5xx + network-level failures
 *
 * Non-retryable (do NOT fall over):
 *   - HTTP 4xx (except 429) — indicates malformed input
 *   - Auth errors (401, 403, "api key not configured")
 *
 * Circuit breaker (sprint spec): after 3 consecutive retryable
 * failures the provider trips into an open state for 60 s, during
 * which it is skipped entirely (callers treat it as unavailable).
 * A successful call after the cool-down closes the breaker again.
 *
 * The registry exposes PROVIDER_TIMEOUT_MS so callers enforce a
 * deterministic upper bound on any single provider call.
 */
import { recordVoiceCircuitBreaker } from '../observability/metrics';
export type ErrorClassification = 'retryable' | 'non_retryable';

export interface ClassifiedError {
  classification: ErrorClassification;
  reason: string;
}

export const PROVIDER_TIMEOUT_MS = 5000;

export class ProviderTimeoutError extends Error {
  constructor(public readonly providerName: string, public readonly timeoutMs: number) {
    super(`Provider ${providerName} timed out after ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * Classify an error as retryable (→ trigger failover) or non_retryable
 * (→ bubble up to caller, do not try another provider).
 */
export function classifyProviderError(err: unknown): ClassifiedError {
  if (err instanceof ProviderTimeoutError) {
    return { classification: 'retryable', reason: 'timeout' };
  }

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { classification: 'retryable', reason: 'timeout' };
  }

  if (/\b503\b/.test(msg) || lower.includes('service unavailable')) {
    return { classification: 'retryable', reason: 'http_503' };
  }

  if (/\b429\b/.test(msg) || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { classification: 'retryable', reason: 'http_429' };
  }

  if (/\b(500|502|504)\b/.test(msg)) {
    return { classification: 'retryable', reason: 'http_5xx' };
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('socket hang up') ||
    lower.includes('network')
  ) {
    return { classification: 'retryable', reason: 'network_error' };
  }

  if (lower.includes('api key') || lower.includes('not configured')) {
    return { classification: 'non_retryable', reason: 'missing_credentials' };
  }

  if (
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg) ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return { classification: 'non_retryable', reason: 'auth_error' };
  }

  if (/\b4\d{2}\b/.test(msg)) {
    return { classification: 'non_retryable', reason: 'http_4xx' };
  }

  // Unknown errors default to retryable so we try the fallback chain
  // rather than failing loudly on the first unexpected shape.
  return { classification: 'retryable', reason: 'unknown_error' };
}

/**
 * Wrap a provider call with a hard timeout. On timeout, rejects with
 * {@link ProviderTimeoutError}, which the classifier treats as retryable.
 */
export function withProviderTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  providerName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ProviderTimeoutError(providerName, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Compose an ordered list of candidate providers for a call:
 * preferred first, then the remaining registered providers in
 * insertion order. Callers iterate this list and break at the
 * first success or non-retryable error.
 */
export function buildProviderPriority<T>(
  providers: Map<string, T>,
  preferred: string,
): Array<[string, T]> {
  const ordered: Array<[string, T]> = [];
  const preferredProvider = providers.get(preferred);
  if (preferredProvider) {
    ordered.push([preferred, preferredProvider]);
  }
  for (const [name, provider] of providers) {
    if (name !== preferred) {
      ordered.push([name, provider]);
    }
  }
  return ordered;
}

// ============================================================
// Circuit Breaker
// ============================================================

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export interface CircuitBreakerStatus {
  failures: number;
  openUntil: number;
  isOpen: boolean;
  remainingCooldownMs: number;
}

export const DEFAULT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 60_000,
};

/**
 * Per-provider circuit breaker. Tracks consecutive retryable failures
 * and trips into an open state once the threshold is reached.
 *
 * State transitions:
 *   closed → open   (after `failureThreshold` consecutive retryable failures)
 *   open   → closed (after a successful call following cool-down)
 *
 * Hot-path safety: telemetry emission is wrapped in try/catch so
 * OTel backend failures never leak into the voice pipeline.
 */
export class CircuitBreaker {
  private readonly failures = new Map<string, number>();
  private readonly openUntil = new Map<string, number>();
  private readonly config: CircuitBreakerConfig;
  private readonly label: string;

  constructor(label: string, config?: Partial<CircuitBreakerConfig>) {
    this.label = label;
    this.config = {
      failureThreshold: config?.failureThreshold ?? DEFAULT_BREAKER_CONFIG.failureThreshold,
      cooldownMs: config?.cooldownMs ?? DEFAULT_BREAKER_CONFIG.cooldownMs,
    };
  }

  /**
   * Is the breaker currently open for this provider?
   * Returns true if the cool-down has not expired.
   */
  isOpen(provider: string): boolean {
    const openUntil = this.openUntil.get(provider) ?? 0;
    if (openUntil === 0) {return false;}
    if (Date.now() < openUntil) {return true;}
    // Cool-down expired — remain registered but allow a probe call.
    this.openUntil.delete(provider);
    return false;
  }

  /**
   * Record a successful call. Closes the breaker (if open) and resets
   * the consecutive-failure counter.
   */
  recordSuccess(provider: string): void {
    const wasOpen = (this.openUntil.get(provider) ?? 0) > 0;
    const hadFailures = (this.failures.get(provider) ?? 0) > 0;
    this.failures.delete(provider);
    this.openUntil.delete(provider);
    if (wasOpen) {
      this.emit(provider, 'closed');
    } else if (hadFailures) {
      this.emit(provider, 'reset');
    }
  }

  /**
   * Record a retryable failure. Returns true if the breaker has
   * just transitioned from closed → open.
   */
  recordFailure(provider: string): boolean {
    const count = (this.failures.get(provider) ?? 0) + 1;
    if (count >= this.config.failureThreshold) {
      this.failures.set(provider, 0);
      this.openUntil.set(provider, Date.now() + this.config.cooldownMs);
      this.emit(provider, 'opened');
      return true;
    }
    this.failures.set(provider, count);
    return false;
  }

  /**
   * Reset a single provider (or all providers if omitted).
   * Useful for admin "force close" and for tests.
   */
  reset(provider?: string): void {
    if (provider === undefined) {
      this.failures.clear();
      this.openUntil.clear();
      return;
    }
    const wasOpen = (this.openUntil.get(provider) ?? 0) > 0;
    this.failures.delete(provider);
    this.openUntil.delete(provider);
    if (wasOpen) {
      this.emit(provider, 'manual_reset');
    }
  }

  /**
   * Snapshot of all tracked providers — used by the admin dashboard.
   */
  getStatus(): Record<string, CircuitBreakerStatus> {
    const tracked = new Set<string>([...this.failures.keys(), ...this.openUntil.keys()]);
    const now = Date.now();
    const result: Record<string, CircuitBreakerStatus> = {};
    for (const provider of tracked) {
      const openUntil = this.openUntil.get(provider) ?? 0;
      const isOpen = openUntil > now;
      result[provider] = {
        failures: this.failures.get(provider) ?? 0,
        openUntil,
        isOpen,
        remainingCooldownMs: isOpen ? openUntil - now : 0,
      };
    }
    return result;
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  private emit(provider: string, state: 'opened' | 'closed' | 'reset' | 'manual_reset'): void {
    try {
      // Map internal transitions to the OTel counter's enum.
      // Both 'opened' and breaker trips map to 'open'; closed/reset/manual_reset
      // collapse to 'closed' from the metric's perspective.
      const metricState: 'open' | 'closed' | 'half_open' = state === 'opened' ? 'open' : 'closed';
      recordVoiceCircuitBreaker(`${this.label}:${provider}`, metricState);
    } catch {
      // Telemetry must never break the voice hot path
    }
  }
}

export const sttCircuitBreaker = new CircuitBreaker('stt');
export const ttsCircuitBreaker = new CircuitBreaker('tts');
