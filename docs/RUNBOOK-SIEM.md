# SIEM Forwarder — Runbook

Security-audit events recorded by the backend fan out to an external SIEM
system in addition to the authoritative `security_audit_log` row in
Postgres. Three sinks are supported:

- **`noop`** — development / self-hosted without external SIEM
- **`datadog`** — HTTPS POST to the Datadog logs-intake API
- **`syslog`** — RFC5424 over UDP to a collector (Splunk, rsyslog, Graylog, …)

The forwarder is **best-effort**. A SIEM outage must never impact request
latency or cause an audit event to be lost from the database. All errors
are logged at `warn` level via the structured logger and swallowed.

---

## 1. Configuration

All sink selection happens at process-startup via environment variables
in `backend/.env` (or the platform's secret store). No runtime toggle.

### 1.1 Common

| Variable        | Values                      | Default | Required |
|-----------------|-----------------------------|---------|----------|
| `SIEM_PROVIDER` | `noop` \| `datadog` \| `syslog` | `noop`  | no       |

### 1.2 Datadog

Applies only when `SIEM_PROVIDER=datadog`.

| Variable                  | Description                                                                 | Required |
|---------------------------|-----------------------------------------------------------------------------|----------|
| `SIEM_DATADOG_API_KEY`    | DD-API-KEY header value. Aliases: `DD_API_KEY`.                             | **yes**  |
| `SIEM_DATADOG_ENDPOINT`   | Logs intake URL. Default: `https://http-intake.logs.datadoghq.com/api/v2/logs`. | no       |
| `SIEM_DATADOG_SOURCE`     | `ddsource` tag. Default: `zenai`.                                           | no       |
| `SIEM_DATADOG_SERVICE`    | `service` tag. Default: `zenai-backend`.                                    | no       |

If `SIEM_PROVIDER=datadog` but no API key is set, the forwarder logs a
warning and **falls back to `noop`** — it will not fail service startup.

### 1.3 Syslog (RFC5424 UDP)

Applies only when `SIEM_PROVIDER=syslog`.

| Variable                | Description                                           | Required |
|-------------------------|-------------------------------------------------------|----------|
| `SIEM_SYSLOG_HOST`      | Collector host (IP or DNS name).                      | **yes**  |
| `SIEM_SYSLOG_PORT`      | UDP port. Default: `514`.                             | no       |
| `SIEM_SYSLOG_FACILITY`  | RFC5424 facility 0-23. Default: `13` (log-audit).     | no       |
| `SIEM_SYSLOG_APP_NAME`  | APP-NAME field. Default: `zenai`.                     | no       |

The forwarder emits messages that look like:

```
<106>1 2026-04-19T10:00:00.000Z host zenai 12345 failed_login - {"id":"evt-1",...}
```

`<106>` = facility 13 × 8 + severity 2 (critical).

Severity mapping:

| Audit severity | RFC5424 severity | Numeric |
|----------------|------------------|---------|
| `critical`     | `Critical`       | 2       |
| `warning`      | `Warning`        | 4       |
| `info`         | `Informational`  | 6       |

---

## 2. Org-level configuration (optional)

The current implementation reads config from `process.env`. Per-org
configuration can be added later by extending `getSIEMForwarder()` to
accept an org-id and look up a row in `public.organizations.siem_config`
(JSONB). Because the forwarder interface (`SIEMForwarder`) is stable,
this extension does not change call-site behavior.

---

## 3. Operational checks

### 3.1 Verify configuration at startup

Grep the backend log for `SIEM forwarder initialized`:

```
{"operation":"siem-forwarder","provider":"datadog"} "SIEM forwarder initialized"
```

If the log says `provider: "noop"` and you expected otherwise, your
environment variables are not being read. Verify:

1. `SIEM_PROVIDER` is set in the *active* environment of the running
   backend process (Railway, Docker, etc.).
2. For Datadog: `SIEM_DATADOG_API_KEY` or `DD_API_KEY` is set.
3. For Syslog: `SIEM_SYSLOG_HOST` is set.

### 3.2 Verify fan-out end-to-end

Trigger a known security event and confirm arrival:

```bash
curl -XPOST https://<backend>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"noone@example.com","password":"wrong"}'
```

This should:

1. Insert a row into `security_audit_log` with `event_type=failed_login`.
2. Within a few seconds, emit a log record in the configured SIEM
   with `event_type: failed_login` and `severity: warning`.

Cross-reference the `id` of the DB row with the `id` field in the SIEM
payload.

### 3.3 Broken fan-out

If database rows are landing but the SIEM is silent, check the backend
logs for entries with `operation: siem-forwarder`. Typical causes:

| Symptom (log) | Cause | Fix |
|---|---|---|
| `SIEM Datadog forward non-2xx` with status 401 | Bad API key | Rotate and restart backend |
| `SIEM Datadog forward non-2xx` with status 403 | API key without `logs_write_api_key` scope | Re-issue key with scope |
| `SIEM Datadog forward failed ... ECONNREFUSED` | Egress blocked | Allowlist `http-intake.logs.datadoghq.com` |
| `SIEM syslog send failed ... EACCES` | Privileged port (514) on non-root | Use a non-privileged port |
| `SIEM syslog socket error ... EHOSTUNREACH` | Collector down / firewall | Check collector, verify routing |
| `Blocked outbound connection to private/reserved address` | Datadog endpoint resolves to a private IP (DNS rebind) | Verify endpoint is correct and public |

---

## 4. Failure modes & non-goals

- **At-most-once delivery.** UDP syslog does not retry; Datadog HTTP
  failures are logged and dropped. The authoritative copy is always the
  database row. If you need guaranteed delivery to the SIEM, consume
  `security_audit_log` via a scheduled job and reconcile.
- **No batching.** Each audit event is one outbound call. Throughput is
  bounded by event volume, which is low (< 100/s at peak for auth
  events). If this changes, consider a queue.
- **No PII scrubbing.** The event payload (`details`) is forwarded as-is.
  Callers must not put secrets in `details`.

---

## 5. Test coverage

See:

- `backend/src/__tests__/unit/security/siem-forwarder.test.ts` — unit
  tests for `configFromEnv`, the three adapters, the RFC5424 shape, the
  UDP round-trip, and the singleton lifecycle.

Run locally with:

```bash
cd backend && npx jest --testPathPatterns=siem-forwarder
```

---

## 6. Change history

| Sprint | Change |
|---|---|
| 1.7 | Initial implementation: noop / datadog / syslog adapters + fan-out from `audit-logger`. |
