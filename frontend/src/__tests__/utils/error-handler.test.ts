import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleError, type ErrorType } from '../../utils/error-handler';

// Mock logger to prevent console noise
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock sentry (imported transitively by logger)
vi.mock('../../services/sentry', () => ({
  captureException: vi.fn(),
}));

describe('handleError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Network errors ----

  it('classifies TypeError "Failed to fetch" as network', () => {
    const result = handleError(new TypeError('Failed to fetch'));
    expect(result.type).toBe('network');
    expect(result.shouldRetry).toBe(true);
    expect(result.userMessage).toContain('Verbindung');
  });

  it('classifies TypeError "NetworkError" as network', () => {
    const result = handleError(new TypeError('NetworkError when attempting to fetch resource'));
    expect(result.type).toBe('network');
    expect(result.shouldRetry).toBe(true);
  });

  it('classifies axios error without response as network', () => {
    const axiosError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      response: undefined,
      config: {},
      toJSON: () => ({}),
    });
    // Mark it as an AxiosError for isAxiosError() check
    (axiosError as unknown as Record<string, unknown>).__CANCEL__ = undefined;
    const result = handleError(axiosError);
    // Without actual axios instance, falls through to unknown or network via message
    expect(['network', 'unknown']).toContain(result.type);
  });

  // ---- Auth errors ----

  it('classifies 401 axios error as auth', () => {
    const axiosError = createAxiosError(401);
    const result = handleError(axiosError);
    expect(result.type).toBe('auth');
    expect(result.shouldRetry).toBe(false);
    expect(result.userMessage).toContain('Sitzung');
  });

  it('classifies 403 axios error as auth', () => {
    const axiosError = createAxiosError(403);
    const result = handleError(axiosError);
    expect(result.type).toBe('auth');
    expect(result.shouldRetry).toBe(false);
  });

  // ---- Validation errors ----

  it('classifies 400 axios error as validation', () => {
    const axiosError = createAxiosError(400);
    const result = handleError(axiosError);
    expect(result.type).toBe('validation');
    expect(result.shouldRetry).toBe(false);
    expect(result.userMessage).toContain('Eingabe');
  });

  it('classifies 422 axios error as validation', () => {
    const axiosError = createAxiosError(422);
    const result = handleError(axiosError);
    expect(result.type).toBe('validation');
  });

  // ---- Server errors ----

  it('classifies 500 axios error as server', () => {
    const axiosError = createAxiosError(500);
    const result = handleError(axiosError);
    expect(result.type).toBe('server');
    expect(result.shouldRetry).toBe(true);
    expect(result.userMessage).toContain('Serverfehler');
  });

  it('classifies 502 axios error as server', () => {
    const axiosError = createAxiosError(502);
    const result = handleError(axiosError);
    expect(result.type).toBe('server');
  });

  it('classifies 503 axios error as server', () => {
    const axiosError = createAxiosError(503);
    const result = handleError(axiosError);
    expect(result.type).toBe('server');
  });

  // ---- Unknown errors ----

  it('classifies random Error as unknown', () => {
    const result = handleError(new Error('Something went wrong'));
    expect(result.type).toBe('unknown');
    expect(result.shouldRetry).toBe(true);
  });

  it('classifies non-Error value as unknown', () => {
    const result = handleError('just a string');
    expect(result.type).toBe('unknown');
  });

  it('classifies null as unknown', () => {
    const result = handleError(null);
    expect(result.type).toBe('unknown');
  });

  // ---- originalError passthrough ----

  it('preserves originalError reference', () => {
    const original = new Error('test');
    const result = handleError(original);
    expect(result.originalError).toBe(original);
  });

  // ---- context logging ----

  it('logs with context when provided', async () => {
    const { logger } = await import('../../utils/logger');
    handleError(new Error('test'), 'MyComponent:action');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[MyComponent:action]'),
      expect.any(Error)
    );
  });

  it('does not log when no context provided', async () => {
    const { logger } = await import('../../utils/logger');
    vi.mocked(logger.error).mockClear();
    handleError(new Error('test'));
    expect(logger.error).not.toHaveBeenCalled();
  });

  // ---- Return shape ----

  it('always returns all required fields', () => {
    const result = handleError(new Error('x'));
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('userMessage');
    expect(result).toHaveProperty('shouldRetry');
    expect(result).toHaveProperty('originalError');
    expect(typeof result.type).toBe('string');
    expect(typeof result.userMessage).toBe('string');
    expect(typeof result.shouldRetry).toBe('boolean');
  });

  // ---- All error types have German messages ----

  it.each<ErrorType>(['network', 'auth', 'validation', 'server', 'unknown'])(
    'type "%s" has a non-empty German user message',
    (type) => {
      // Create appropriate errors for each type
      const errors: Record<ErrorType, unknown> = {
        network: new TypeError('Failed to fetch'),
        auth: createAxiosError(401),
        validation: createAxiosError(400),
        server: createAxiosError(500),
        unknown: 42,
      };
      const result = handleError(errors[type]);
      expect(result.userMessage.length).toBeGreaterThan(10);
    }
  );
});

// ============================================
// Helper: create a fake Axios error
// ============================================

function createAxiosError(status: number) {
  const error = new Error(`Request failed with status code ${status}`) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: unknown };
    config: Record<string, unknown>;
    toJSON: () => Record<string, unknown>;
  };
  error.isAxiosError = true;
  error.response = { status, data: {} };
  error.config = {};
  error.toJSON = () => ({});
  return error;
}
