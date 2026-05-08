# ZenAI Observability Guide

## Overview

ZenAI uses a layered observability stack:

| Layer | Tool | Purpose |
|-------|------|---------|
| Error Tracking | Sentry | Exceptions, stack traces, Session Replay |
| Metrics | Prometheus-compatible | HTTP, DB, AI token, tool execution metrics |
| Tracing | OpenTelemetry (optional) | Distributed request tracing |
| AI Traces | Custom (Langfuse-style) | AI generation tracking with cost |
| Logging | Structured JSON | All application logs via `logger.*` |

## Quick Start

### 1. Sentry Setup

1. Create a Sentry account at [sentry.io](https://sentry.io)
2. Create two projects: `zenai-backend` (Node.js) and `zenai-frontend` (React)
3. Set environment variables:

```env
# Backend (.env)
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project-id>

# Frontend (.env)
VITE_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project-id>
```

4. For source map uploads in CI, set GitHub secrets:
   - `SENTRY_AUTH_TOKEN` — Organization auth token (Settings → Auth Tokens)
   - `SENTRY_ORG` — Your Sentry organization slug
   - `SENTRY_PROJECT_FRONTEND` — Frontend project slug (e.g., `zenai-frontend`)
   - `SENTRY_PROJECT_BACKEND` — Backend project slug (e.g., `zenai-backend`)

### 2. Recommended Alert Rules (Sentry Dashboard)

Configure these alerts manually in the Sentry web UI:

| Alert | Condition | Action |
|-------|-----------|--------|
| High Error Rate | >10 events/hour for any issue | Email + Slack |
| New Issue in Production | First occurrence of new issue | Email |
| Unhandled Exception Spike | >5 unhandled exceptions/min | Email + PagerDuty |
| Performance Regression | P95 latency >5s for `/api/chat/*` | Email |
| Error Rate % | >1% of transactions are errors | Email |

### 3. Metrics Endpoints

| Endpoint | Auth | Format |
|----------|------|--------|
| `GET /api/health` | None | JSON — basic status |
| `GET /api/health/ready` | None | JSON — DB readiness (Kubernetes/Railway probe) |
| `GET /api/health/live` | None | JSON — liveness probe |
| `GET /api/health/detailed` | API Key | JSON — full system health |
| `GET /api/health/metrics` | None | Prometheus text format |
| `GET /api/observability/metrics` | API Key | JSON — OTel in-memory snapshots |
| `GET /api/observability/health` | API Key | JSON — tracing + queue health |

### 4. Structured Logging

All backend logs use `logger.*` (never raw `console.log`).

**Production format:** JSON with automatic `requestId` and `userId` injection via AsyncLocalStorage.

```json
{
  "timestamp": "2026-04-04T12:00:00.000Z",
  "level": "info",
  "message": "← GET /api/personal/ideas 200 45ms",
  "context": {
    "requestId": "abc-123",
    "userId": "user-456",
    "operation": "http_response",
    "duration": 45
  }
}
```

**Log levels:** `debug` < `info` < `warn` < `error`. Set via `LOG_LEVEL` env var (default: `info`).

**Child loggers:** Use `logger.child({ operation: 'myService' })` for service-specific loggers.

### 5. OpenTelemetry (Optional)

For distributed tracing with an external collector (e.g., Grafana Cloud, Jaeger):

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway.grafana.net/otlp
OTEL_SERVICE_NAME=zenai-backend
```

OTel auto-instruments HTTP, Express, and PostgreSQL. If the packages aren't installed, tracing degrades to no-ops gracefully.

## Troubleshooting

### Source maps not appearing in Sentry

1. Check CI logs for `sentry-release` job — ensure `SENTRY_AUTH_TOKEN` secret is set
2. Verify release version matches: `zenai@<commit-sha>`
3. In Sentry UI → Releases → check if artifacts were uploaded

### Logs not showing requestId

1. Ensure `requestContextMiddleware` is registered before route handlers
2. Check that `requestIdMiddleware` sets `res.locals.requestId`
3. Background jobs: use `runAsUser(userId, fn)` from `request-context.ts`

### Railway deployment health check failing

1. Check `/api/health/ready` returns 200 (DB connection OK)
2. If 503: DB connection not yet established — `start-period: 10s` should handle this
3. Check Railway logs for database connection errors
