/**
 * Sprint 1.13: Provider Registry — error classification,
 * timeout enforcement, priority ordering, and circuit breaker.
 */

jest.mock('../../../../services/observability/metrics', () => ({
  recordVoiceCircuitBreaker: jest.fn(),
}));

import {
  classifyProviderError,
  withProviderTimeout,
  buildProviderPriority,
  ProviderTimeoutError,
  PROVIDER_TIMEOUT_MS,
  CircuitBreaker,
  DEFAULT_BREAKER_CONFIG,
} from '../../../../services/voice/provider-registry';
import { recordVoiceCircuitBreaker } from '../../../../services/observability/metrics';

const mockBreakerMetric = recordVoiceCircuitBreaker as jest.Mock;

describe('classifyProviderError', () => {
  it('classifies ProviderTimeoutError as retryable/timeout', () => {
    const result = classifyProviderError(new ProviderTimeoutError('whisper', 5000));
    expect(result).toEqual({ classification: 'retryable', reason: 'timeout' });
  });

  it('classifies generic "timed out" error as retryable/timeout', () => {
    const result = classifyProviderError(new Error('request timed out'));
    expect(result.classification).toBe('retryable');
    expect(result.reason).toBe('timeout');
  });

  it('classifies HTTP 503 as retryable/http_503', () => {
    const result = classifyProviderError(new Error('HTTP 503 Service Unavailable'));
    expect(result).toEqual({ classification: 'retryable', reason: 'http_503' });
  });

  it('classifies HTTP 429 as retryable/http_429', () => {
    const result = classifyProviderError(new Error('HTTP 429 Too Many Requests'));
    expect(result).toEqual({ classification: 'retryable', reason: 'http_429' });
  });

  it('classifies HTTP 500/502/504 as retryable/http_5xx', () => {
    expect(classifyProviderError(new Error('HTTP 500'))).toEqual({
      classification: 'retryable',
      reason: 'http_5xx',
    });
    expect(classifyProviderError(new Error('HTTP 502 Bad Gateway'))).toEqual({
      classification: 'retryable',
      reason: 'http_5xx',
    });
    expect(classifyProviderError(new Error('HTTP 504 Gateway Timeout')).classification).toBe('retryable');
  });

  it('classifies network errors as retryable/network_error', () => {
    expect(classifyProviderError(new Error('ECONNREFUSED')).reason).toBe('network_error');
    expect(classifyProviderError(new Error('ECONNRESET')).reason).toBe('network_error');
    expect(classifyProviderError(new Error('ENOTFOUND api.example.com')).reason).toBe('network_error');
    expect(classifyProviderError(new Error('socket hang up')).reason).toBe('network_error');
  });

  it('classifies missing-credentials errors as non_retryable', () => {
    const result = classifyProviderError(new Error('API key not configured'));
    expect(result).toEqual({ classification: 'non_retryable', reason: 'missing_credentials' });
  });

  it('classifies auth errors (401/403) as non_retryable/auth_error', () => {
    expect(classifyProviderError(new Error('HTTP 401 Unauthorized'))).toEqual({
      classification: 'non_retryable',
      reason: 'auth_error',
    });
    expect(classifyProviderError(new Error('HTTP 403 Forbidden')).reason).toBe('auth_error');
  });

  it('classifies generic 4xx as non_retryable/http_4xx', () => {
    const result = classifyProviderError(new Error('HTTP 400 Bad Request'));
    expect(result).toEqual({ classification: 'non_retryable', reason: 'http_4xx' });
  });

  it('classifies unknown errors as retryable/unknown_error', () => {
    const result = classifyProviderError(new Error('something weird happened'));
    expect(result).toEqual({ classification: 'retryable', reason: 'unknown_error' });
  });

  it('handles non-Error inputs gracefully', () => {
    const result = classifyProviderError('string error');
    expect(result.classification).toBe('retryable');
  });
});

describe('withProviderTimeout', () => {
  it('resolves when the inner promise settles in time', async () => {
    const value = await withProviderTimeout(Promise.resolve('ok'), 100, 'p');
    expect(value).toBe('ok');
  });

  it('rejects with ProviderTimeoutError when exceeded', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200));
    await expect(withProviderTimeout(slow, 20, 'lagging')).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it('propagates inner rejection errors', async () => {
    await expect(
      withProviderTimeout(Promise.reject(new Error('inner boom')), 100, 'p'),
    ).rejects.toThrow('inner boom');
  });

  it('exposes a 5000 ms default timeout constant', () => {
    expect(PROVIDER_TIMEOUT_MS).toBe(5000);
  });
});

describe('buildProviderPriority', () => {
  it('places the preferred provider first', () => {
    const providers = new Map<string, string>([
      ['whisper', 'W'],
      ['deepgram', 'D'],
    ]);
    const order = buildProviderPriority(providers, 'deepgram');
    expect(order.map(([n]) => n)).toEqual(['deepgram', 'whisper']);
  });

  it('preserves insertion order when preferred is missing', () => {
    const providers = new Map<string, string>([
      ['whisper', 'W'],
      ['deepgram', 'D'],
    ]);
    const order = buildProviderPriority(providers, 'nonexistent');
    expect(order.map(([n]) => n)).toEqual(['whisper', 'deepgram']);
  });

  it('returns empty list when no providers registered', () => {
    const order = buildProviderPriority(new Map(), 'whisper');
    expect(order).toEqual([]);
  });
});

describe('CircuitBreaker', () => {
  beforeEach(() => {
    mockBreakerMetric.mockClear();
  });

  it('starts closed for all providers', () => {
    const cb = new CircuitBreaker('stt');
    expect(cb.isOpen('whisper')).toBe(false);
    expect(cb.getStatus()).toEqual({});
  });

  it('increments failures without opening below threshold', () => {
    const cb = new CircuitBreaker('stt');
    expect(cb.recordFailure('whisper')).toBe(false);
    expect(cb.recordFailure('whisper')).toBe(false);
    expect(cb.isOpen('whisper')).toBe(false);
    expect(cb.getStatus().whisper.failures).toBe(2);
  });

  it('trips open after failureThreshold consecutive failures', () => {
    const cb = new CircuitBreaker('stt');
    cb.recordFailure('whisper');
    cb.recordFailure('whisper');
    expect(cb.recordFailure('whisper')).toBe(true);
    expect(cb.isOpen('whisper')).toBe(true);
  });

  it('emits OTel metric on open transition', () => {
    const cb = new CircuitBreaker('stt');
    cb.recordFailure('whisper');
    cb.recordFailure('whisper');
    cb.recordFailure('whisper');
    expect(mockBreakerMetric).toHaveBeenCalledWith('stt:whisper', 'open');
  });

  it('remains open until cooldown expires', () => {
    const cb = new CircuitBreaker('stt', { failureThreshold: 2, cooldownMs: 1000 });
    cb.recordFailure('whisper');
    cb.recordFailure('whisper');
    const status = cb.getStatus();
    expect(status.whisper.isOpen).toBe(true);
    expect(status.whisper.remainingCooldownMs).toBeGreaterThan(0);
  });

  it('allows probe call after cooldown', () => {
    const cb = new CircuitBreaker('stt', { failureThreshold: 1, cooldownMs: 5 });
    cb.recordFailure('whisper');
    expect(cb.isOpen('whisper')).toBe(true);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cb.isOpen('whisper')).toBe(false);
        resolve();
      }, 20);
    });
  });

  it('closes breaker on successful call and emits metric', () => {
    const cb = new CircuitBreaker('tts', { failureThreshold: 2, cooldownMs: 1000 });
    cb.recordFailure('elevenlabs');
    cb.recordFailure('elevenlabs');
    mockBreakerMetric.mockClear();
    cb.recordSuccess('elevenlabs');
    expect(cb.isOpen('elevenlabs')).toBe(false);
    expect(mockBreakerMetric).toHaveBeenCalledWith('tts:elevenlabs', 'closed');
  });

  it('recordSuccess with no prior failures emits nothing', () => {
    const cb = new CircuitBreaker('tts');
    cb.recordSuccess('edge-tts');
    expect(mockBreakerMetric).not.toHaveBeenCalled();
  });

  it('reset clears state and emits manual-reset metric when open', () => {
    const cb = new CircuitBreaker('stt', { failureThreshold: 1, cooldownMs: 1000 });
    cb.recordFailure('whisper');
    mockBreakerMetric.mockClear();
    cb.reset('whisper');
    expect(cb.isOpen('whisper')).toBe(false);
    expect(mockBreakerMetric).toHaveBeenCalledWith('stt:whisper', 'closed');
  });

  it('reset() with no arg clears everything', () => {
    const cb = new CircuitBreaker('stt');
    cb.recordFailure('whisper');
    cb.recordFailure('deepgram');
    cb.reset();
    expect(cb.getStatus()).toEqual({});
  });

  it('getStatus reflects remainingCooldownMs for open providers', () => {
    const cb = new CircuitBreaker('tts', { failureThreshold: 1, cooldownMs: 5000 });
    cb.recordFailure('elevenlabs');
    const status = cb.getStatus();
    expect(status.elevenlabs.isOpen).toBe(true);
    expect(status.elevenlabs.remainingCooldownMs).toBeLessThanOrEqual(5000);
    expect(status.elevenlabs.remainingCooldownMs).toBeGreaterThan(0);
  });

  it('getConfig exposes threshold + cooldown', () => {
    const cb = new CircuitBreaker('stt', { failureThreshold: 7, cooldownMs: 12345 });
    expect(cb.getConfig()).toEqual({ failureThreshold: 7, cooldownMs: 12345 });
  });

  it('uses DEFAULT_BREAKER_CONFIG when no overrides given', () => {
    const cb = new CircuitBreaker('stt');
    expect(cb.getConfig()).toEqual(DEFAULT_BREAKER_CONFIG);
    expect(DEFAULT_BREAKER_CONFIG.failureThreshold).toBe(3);
    expect(DEFAULT_BREAKER_CONFIG.cooldownMs).toBe(60_000);
  });

  it('does not throw when OTel emit throws (fail-safe telemetry)', () => {
    mockBreakerMetric.mockImplementationOnce(() => {
      throw new Error('otel down');
    });
    const cb = new CircuitBreaker('stt', { failureThreshold: 1, cooldownMs: 1000 });
    expect(() => cb.recordFailure('whisper')).not.toThrow();
  });
});
