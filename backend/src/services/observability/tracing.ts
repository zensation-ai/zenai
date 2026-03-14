/**
 * Phase 61: OpenTelemetry Tracing Setup
 *
 * Initializes distributed tracing with auto-instrumentation for HTTP, Express, PostgreSQL.
 * Console exporter in dev, OTLP in production (configurable via OTEL_EXPORTER_OTLP_ENDPOINT).
 * Graceful degradation: if OpenTelemetry packages aren't available, tracing is disabled.
 */

import { logger } from '../../utils/logger';

// Track initialization state
let tracingInitialized = false;
let sdkInstance: { shutdown(): Promise<void> } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let otelApi: any = null;

/**
 * Initialize OpenTelemetry tracing.
 * Safe to call even if OTel packages aren't installed.
 */
export async function initTracing(): Promise<boolean> {
  if (tracingInitialized) {
    return true;
  }

  try {
    // Dynamic imports so the app doesn't crash if packages aren't installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('@opentelemetry/api');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

    otelApi = api;

    const isProduction = process.env.NODE_ENV === 'production';
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    // Choose exporter based on environment
    let traceExporter;
    let metricReader;

    if (otlpEndpoint || isProduction) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

      traceExporter = new OTLPTraceExporter({
        url: otlpEndpoint ? `${otlpEndpoint}/v1/traces` : undefined,
      });

      metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: otlpEndpoint ? `${otlpEndpoint}/v1/metrics` : undefined,
        }),
        exportIntervalMillis: 60_000,
      });

      logger.info('OpenTelemetry: OTLP exporter configured', {
        operation: 'tracing',
        endpoint: otlpEndpoint || 'default',
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node');
      traceExporter = new ConsoleSpanExporter();

      logger.info('OpenTelemetry: Console exporter configured (dev mode)', {
        operation: 'tracing',
      });
    }

    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'zenai-backend',
      traceExporter,
      metricReader,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });

    sdk.start();
    sdkInstance = sdk;
    tracingInitialized = true;

    logger.info('OpenTelemetry tracing initialized successfully', {
      operation: 'tracing',
      serviceName: process.env.OTEL_SERVICE_NAME || 'zenai-backend',
    });

    return true;
  } catch (error) {
    logger.warn('OpenTelemetry tracing not available (packages may not be installed)', {
      operation: 'tracing',
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

interface NoopSpan {
  setAttribute(key: string, value: unknown): NoopSpan;
  setStatus(status: { code: number; message?: string }): NoopSpan;
  end(): void;
  recordException(error: unknown): void;
  spanContext(): { traceId: string; spanId: string; traceFlags: number };
  isRecording(): boolean;
  updateName(name: string): NoopSpan;
  addEvent(name: string): NoopSpan;
  setAttributes(attrs: Record<string, unknown>): NoopSpan;
  addLink(link: unknown): NoopSpan;
}

function createNoopSpan(): NoopSpan {
  const noop: NoopSpan = {
    setAttribute: () => noop,
    setStatus: () => noop,
    end: () => undefined,
    recordException: () => undefined,
    spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
    isRecording: () => false,
    updateName: () => noop,
    addEvent: () => noop,
    setAttributes: () => noop,
    addLink: () => noop,
  };
  return noop;
}

interface TracerLike {
  startSpan(name: string): NoopSpan;
  startActiveSpan<T>(name: string, fn: (span: NoopSpan) => T): T;
}

/**
 * Get a tracer instance for creating spans.
 * Returns a no-op tracer if tracing isn't initialized.
 */
export function getTracer(name: string = 'zenai-backend'): TracerLike {
  if (otelApi) {
    return otelApi.trace.getTracer(name);
  }
  return {
    startSpan: () => createNoopSpan(),
    startActiveSpan: <T>(_spanName: string, fn: (span: NoopSpan) => T): T => {
      return fn(createNoopSpan());
    },
  };
}

/**
 * Get the current trace ID from active context, if available.
 */
export function getCurrentTraceId(): string | null {
  if (!otelApi) {return null;}
  try {
    const span = otelApi.trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      return ctx.traceId || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Check if tracing is initialized and active.
 */
export function isTracingEnabled(): boolean {
  return tracingInitialized;
}

/**
 * Gracefully shut down the tracing SDK.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
      logger.info('OpenTelemetry tracing shut down', { operation: 'tracing' });
    } catch (error) {
      logger.error('Error shutting down OpenTelemetry', error instanceof Error ? error : undefined, {
        operation: 'tracing',
      });
    }
    sdkInstance = null;
    tracingInitialized = false;
  }
}
