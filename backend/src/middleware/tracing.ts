/**
 * Phase 61: Request Tracing Middleware
 *
 * Express middleware that creates a span per HTTP request.
 * Records method, path, status code, duration, and user ID.
 * Adds X-Trace-ID header to responses for distributed tracing.
 */

import { Request, Response, NextFunction } from 'express';
import { getTracer, getCurrentTraceId, isTracingEnabled, isLoadTestMode } from '../services/observability/tracing';

/**
 * Tracing middleware that wraps each request in an OpenTelemetry span.
 * Integrates with the existing requestId middleware by reading res.locals.requestId.
 */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip tracing for health checks and static assets
  if (req.path.startsWith('/api/health') || req.path.startsWith('/api-docs')) {
    return next();
  }

  const startTime = Date.now();

  // LOAD_TEST_MODE tags every response so Grafana / Sentry can exclude synthetic
  // traffic from SaaS-health dashboards. Enabled purely via env var — see
  // scripts/load-test/README.md.
  const loadTest = isLoadTestMode();
  if (loadTest) {
    res.setHeader('X-Load-Test', 'true');
  }

  // Try to get trace ID from active OTel context
  const traceId = getCurrentTraceId();
  if (traceId) {
    res.setHeader('X-Trace-ID', traceId);
  }

  // If tracing is enabled, create a span
  if (isTracingEnabled()) {
    const tracer = getTracer('zenai-http');
    const span = tracer.startSpan(`${req.method} ${req.route?.path || req.path}`);

    span.setAttribute('http.method', req.method);
    span.setAttribute('http.url', req.originalUrl);
    span.setAttribute('http.target', req.path);
    if (loadTest) {
      span.setAttribute('load_test', true);
    }

    // Add request ID from requestId middleware
    const requestId = res.locals.requestId;
    if (requestId) {
      span.setAttribute('request.id', requestId);
    }

    // Add user info if available (from auth middleware)
    const userId = (req as Request & { user?: { id?: string } }).user?.id;
    if (userId) {
      span.setAttribute('user.id', userId);
    }

    // Set trace ID from span context
    const spanCtx = span.spanContext();
    if (spanCtx.traceId) {
      res.setHeader('X-Trace-ID', spanCtx.traceId);
    }

    // Hook into response finish to record duration and status
    const originalEnd = res.end;
    res.end = function (this: Response, ...args: Parameters<typeof originalEnd>) {
      const duration = Date.now() - startTime;

      span.setAttribute('http.status_code', res.statusCode);
      span.setAttribute('http.duration_ms', duration);

      if (res.statusCode >= 400) {
        span.setStatus({ code: 2, message: `HTTP ${res.statusCode}` }); // SpanStatusCode.ERROR = 2
      } else {
        span.setStatus({ code: 1 }); // SpanStatusCode.OK = 1
      }

      span.end();

      return originalEnd.apply(this, args);
    } as typeof originalEnd;
  }

  next();
}
