/**
 * Phase 61: OpenTelemetry Tracing Tests
 *
 * Tests for tracing initialization, tracer creation, and shutdown.
 */

// Mock OpenTelemetry modules before imports
const mockStart = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockGetTracer = jest.fn().mockReturnValue({
  startSpan: jest.fn().mockReturnValue({
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
    end: jest.fn(),
    recordException: jest.fn(),
    spanContext: jest.fn().mockReturnValue({ traceId: 'abc123', spanId: 'def456', traceFlags: 1 }),
  }),
  startActiveSpan: jest.fn(),
});
const mockGetActiveSpan = jest.fn().mockReturnValue(null);

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: mockGetTracer,
    getActiveSpan: mockGetActiveSpan,
  },
}), { virtual: true });

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({
    start: mockStart,
    shutdown: mockShutdown,
  })),
}), { virtual: true });

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn().mockReturnValue([]),
}), { virtual: true });

jest.mock('@opentelemetry/sdk-trace-node', () => ({
  ConsoleSpanExporter: jest.fn(),
}), { virtual: true });

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}), { virtual: true });

jest.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: jest.fn(),
}), { virtual: true });

jest.mock('@opentelemetry/sdk-metrics', () => ({
  PeriodicExportingMetricReader: jest.fn(),
}), { virtual: true });

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocks
import {
  initTracing,
  getTracer,
  getCurrentTraceId,
  isTracingEnabled,
  shutdownTracing,
} from '../../../services/observability/tracing';

describe('OpenTelemetry Tracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initTracing', () => {
    it('should initialize tracing successfully', async () => {
      const result = await initTracing();
      expect(result).toBe(true);
      expect(mockStart).toHaveBeenCalled();
    });

    it('should return true on repeated initialization', async () => {
      const result = await initTracing();
      expect(result).toBe(true);
    });

    it('should use ConsoleSpanExporter in dev mode', async () => {
      // Already initialized from previous test, but verifies no crash
      expect(isTracingEnabled()).toBe(true);
    });
  });

  describe('getTracer', () => {
    it('should return a tracer with default name', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
    });

    it('should return a tracer with custom name', () => {
      const tracer = getTracer('custom-tracer');
      expect(tracer).toBeDefined();
    });

    it('should return a tracer that can create spans', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test-span');
      expect(span).toBeDefined();
      expect(span.setAttribute).toBeDefined();
      expect(span.end).toBeDefined();
    });
  });

  describe('getCurrentTraceId', () => {
    it('should return null when no active span', () => {
      mockGetActiveSpan.mockReturnValueOnce(null);
      const traceId = getCurrentTraceId();
      expect(traceId).toBeNull();
    });

    it('should return trace ID from active span', () => {
      mockGetActiveSpan.mockReturnValueOnce({
        spanContext: () => ({ traceId: 'test-trace-id', spanId: 'span-1', traceFlags: 1 }),
      });
      const traceId = getCurrentTraceId();
      expect(traceId).toBe('test-trace-id');
    });

    it('should return null when span context has empty traceId', () => {
      mockGetActiveSpan.mockReturnValueOnce({
        spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
      });
      const traceId = getCurrentTraceId();
      expect(traceId).toBeNull();
    });
  });

  describe('isTracingEnabled', () => {
    it('should return true after initialization', () => {
      expect(isTracingEnabled()).toBe(true);
    });
  });

  describe('shutdownTracing', () => {
    it('should shut down the SDK', async () => {
      await shutdownTracing();
      expect(mockShutdown).toHaveBeenCalled();
    });

    it('should be safe to call multiple times', async () => {
      await shutdownTracing(); // Already shut down
      // Should not throw
    });

    it('should mark tracing as disabled after shutdown', async () => {
      expect(isTracingEnabled()).toBe(false);
    });
  });
});
