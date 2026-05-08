/**
 * SIEM Forwarder — fan-out of security-audit events to external SIEM
 * systems. Keeps the primary audit record in Postgres, ships a structured
 * copy to one of three sinks:
 *
 *   - noop    : no-op, for environments without an external SIEM
 *   - datadog : HTTPS POST to the Datadog logs-intake API
 *   - syslog  : RFC5424 UDP syslog to a collector (Splunk, rsyslog, etc.)
 *
 * The forwarder is best-effort. It MUST NOT throw into its caller — the
 * database record is authoritative, external delivery is a fan-out. All
 * errors are logged and swallowed.
 *
 * Configuration precedence:
 *   1. Per-call override (e.g. org-specific sink passed by caller)
 *   2. Process env (SIEM_PROVIDER + associated settings)
 *   3. Fallback: 'noop'
 */

import dgram from 'node:dgram';
import { logger } from '../../utils/logger';
import { checkedFetch } from '../../utils/checked-http';
import { recordSIEMForward } from '../observability/metrics';
import type { SecurityEvent, SecuritySeverity } from './audit-logger';
import { decrypt, encrypt, isEncrypted } from './field-encryption';
import { queryPublic } from '../../utils/database-context';

// ===========================================
// Types
// ===========================================

export type SIEMProvider = 'noop' | 'datadog' | 'syslog';

export interface NoopSIEMConfig {
  provider: 'noop';
}

export interface DatadogSIEMConfig {
  provider: 'datadog';
  /** Datadog logs-intake URL, e.g. https://http-intake.logs.datadoghq.com/api/v2/logs */
  endpoint: string;
  /** DD-API-KEY header value */
  apiKey: string;
  /** Datadog source tag (defaults to 'zenai') */
  source?: string;
  /** Service tag */
  service?: string;
}

export interface SyslogSIEMConfig {
  provider: 'syslog';
  /** Collector host (IPv4/IPv6 literal or DNS name) */
  host: string;
  /** Collector UDP port (default 514) */
  port?: number;
  /** RFC5424 facility 0-23 (default 13 = log-audit) */
  facility?: number;
  /** app-name field (default 'zenai') */
  appName?: string;
}

export type SIEMConfig = NoopSIEMConfig | DatadogSIEMConfig | SyslogSIEMConfig;

export interface SIEMForwarder {
  readonly provider: SIEMProvider;
  forward(event: SecurityEvent): Promise<void>;
  /** Best-effort close of any long-lived resources. */
  close(): Promise<void>;
}

// ===========================================
// Status tracking (ring buffer + counters)
// ===========================================

export interface SIEMForwardRecord {
  eventId: string | null;
  eventType: string;
  severity: SecuritySeverity;
  ok: boolean;
  error?: string;
  /** Wall-clock ms when the forward attempt resolved. */
  ts: number;
}

export interface SIEMStatus {
  provider: SIEMProvider;
  successCount: number;
  failureCount: number;
  /** Failures ÷ total; 0 when total = 0. */
  failureRate: number;
  /** Last observed forward record, or null if none. */
  lastForward: SIEMForwardRecord | null;
  /** Last observed failure, or null. */
  lastFailure: SIEMForwardRecord | null;
  /** Most-recent first, capped at SIEM_STATUS_RING_SIZE. */
  recent: SIEMForwardRecord[];
}

export const SIEM_STATUS_RING_SIZE = 50;

class SIEMStatsTracker {
  private success = 0;
  private failure = 0;
  private last: SIEMForwardRecord | null = null;
  private lastFail: SIEMForwardRecord | null = null;
  private ring: SIEMForwardRecord[] = [];

  record(rec: SIEMForwardRecord): void {
    if (rec.ok) {
      this.success += 1;
    } else {
      this.failure += 1;
      this.lastFail = rec;
    }
    this.last = rec;
    this.ring.unshift(rec);
    if (this.ring.length > SIEM_STATUS_RING_SIZE) {
      this.ring.length = SIEM_STATUS_RING_SIZE;
    }
  }

  snapshot(provider: SIEMProvider): SIEMStatus {
    const total = this.success + this.failure;
    return {
      provider,
      successCount: this.success,
      failureCount: this.failure,
      failureRate: total === 0 ? 0 : this.failure / total,
      lastForward: this.last,
      lastFailure: this.lastFail,
      recent: [...this.ring],
    };
  }

  reset(): void {
    this.success = 0;
    this.failure = 0;
    this.last = null;
    this.lastFail = null;
    this.ring = [];
  }
}

const tracker = new SIEMStatsTracker();

/**
 * Record a forward-result in the ring buffer and emit the Prometheus metric.
 *
 * Sprint 1.9: callers pass the actual `activeProvider` that ran the forward so
 * that per-org calls label the metric correctly (previously the label always
 * came from the env singleton, which under-reported non-default sinks).
 */
function recordForwardResult(
  event: SecurityEvent,
  ok: boolean,
  activeProvider: SIEMProvider,
  error?: string,
): void {
  tracker.record({
    eventId: event.id ?? null,
    eventType: event.event_type,
    severity: event.severity,
    ok,
    error,
    ts: Date.now(),
  });

  // Emit OTel/Prometheus metric so the SIEMForwardFailureRate alert has data.
  try {
    recordSIEMForward(activeProvider, ok, { severity: event.severity, error });
  } catch {
    /* metrics are best-effort; never bubble into the caller */
  }
}

// ===========================================
// RFC5424 severity mapping
// ===========================================

// 0=Emergency, 1=Alert, 2=Critical, 3=Error, 4=Warning, 5=Notice, 6=Info, 7=Debug
function rfc5424Severity(sev: SecuritySeverity): number {
  switch (sev) {
    case 'critical': return 2;
    case 'warning':  return 4;
    case 'info':     return 6;
    default:         return 6;
  }
}

// ===========================================
// Noop adapter
// ===========================================

class NoopSIEMForwarder implements SIEMForwarder {
  readonly provider: SIEMProvider = 'noop';
  async forward(event: SecurityEvent): Promise<void> {
    logger.debug('SIEM noop forward', {
      operation: 'siem-forwarder',
      eventId: event.id,
      eventType: event.event_type,
    });
    recordForwardResult(event, true, this.provider);
  }
  async close(): Promise<void> { /* nothing to do */ }
}

// ===========================================
// Datadog adapter
// ===========================================

class DatadogSIEMForwarder implements SIEMForwarder {
  readonly provider: SIEMProvider = 'datadog';
  constructor(private readonly cfg: DatadogSIEMConfig) {
    if (!cfg.endpoint) {throw new Error('Datadog SIEM: endpoint is required');}
    if (!cfg.apiKey) {throw new Error('Datadog SIEM: apiKey is required');}
  }

  async forward(event: SecurityEvent): Promise<void> {
    const body = {
      ddsource: this.cfg.source ?? 'zenai',
      service: this.cfg.service ?? 'zenai-backend',
      hostname: process.env.HOSTNAME ?? 'zenai',
      ddtags: [
        `env:${process.env.NODE_ENV ?? 'development'}`,
        `severity:${event.severity}`,
        `event_type:${event.event_type}`,
        `context:${event.context}`,
      ].join(','),
      status: event.severity === 'critical' ? 'error' : event.severity === 'warning' ? 'warn' : 'info',
      message: `security.${event.event_type} (${event.severity}) user=${event.user_id}`,
      event,
    };

    try {
      const res = await checkedFetch(this.cfg.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.cfg.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.warn('SIEM Datadog forward non-2xx', {
          operation: 'siem-forwarder',
          eventId: event.id,
          status: res.status,
          body: text.slice(0, 400),
        });
        recordForwardResult(event, false, this.provider, `HTTP ${res.status}`);
        return;
      }
      recordForwardResult(event, true, this.provider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('SIEM Datadog forward failed', {
        operation: 'siem-forwarder',
        eventId: event.id,
        error: msg,
      });
      recordForwardResult(event, false, this.provider, msg);
    }
  }

  async close(): Promise<void> { /* fetch agents self-manage */ }
}

// ===========================================
// Syslog adapter (RFC5424 over UDP)
// ===========================================

class SyslogSIEMForwarder implements SIEMForwarder {
  readonly provider: SIEMProvider = 'syslog';
  private socket: dgram.Socket | null = null;

  constructor(private readonly cfg: SyslogSIEMConfig) {
    if (!cfg.host) {throw new Error('Syslog SIEM: host is required');}
  }

  private getSocket(): dgram.Socket {
    if (!this.socket) {
      this.socket = dgram.createSocket('udp4');
      this.socket.on('error', (err) => {
        logger.warn('SIEM syslog socket error', {
          operation: 'siem-forwarder',
          error: err.message,
        });
      });
    }
    return this.socket;
  }

  /**
   * Build an RFC5424 syslog line:
   *   <PRI>1 TIMESTAMP HOST APP PROCID MSGID STRUCTURED-DATA MSG
   */
  buildMessage(event: SecurityEvent): string {
    const facility = this.cfg.facility ?? 13; // 13 = log-audit
    const severity = rfc5424Severity(event.severity);
    const pri = facility * 8 + severity;
    const timestamp = new Date(event.created_at ?? Date.now()).toISOString();
    const host = process.env.HOSTNAME ?? 'zenai';
    const app = this.cfg.appName ?? 'zenai';
    const procId = String(process.pid);
    const msgId = event.event_type;
    const structuredData = '-';
    const msg = JSON.stringify({
      id: event.id,
      user_id: event.user_id,
      ip_address: event.ip_address,
      severity: event.severity,
      context: event.context,
      details: event.details,
    });
    return `<${pri}>1 ${timestamp} ${host} ${app} ${procId} ${msgId} ${structuredData} ${msg}`;
  }

  async forward(event: SecurityEvent): Promise<void> {
    return new Promise((resolve) => {
      try {
        const buf = Buffer.from(this.buildMessage(event), 'utf-8');
        this.getSocket().send(buf, this.cfg.port ?? 514, this.cfg.host, (err) => {
          if (err) {
            logger.warn('SIEM syslog send failed', {
              operation: 'siem-forwarder',
              eventId: event.id,
              error: err.message,
            });
            recordForwardResult(event, false, this.provider, err.message);
          } else {
            recordForwardResult(event, true, this.provider);
          }
          resolve();
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('SIEM syslog forward threw', {
          operation: 'siem-forwarder',
          eventId: event.id,
          error: msg,
        });
        recordForwardResult(event, false, this.provider, msg);
        resolve();
      }
    });
  }

  async close(): Promise<void> {
    if (this.socket) {
      await new Promise<void>((resolve) => {
        this.socket?.close(() => resolve());
      });
      this.socket = null;
    }
  }
}

// ===========================================
// Factory + env-driven singleton
// ===========================================

export function createSIEMForwarder(cfg: SIEMConfig): SIEMForwarder {
  switch (cfg.provider) {
    case 'noop':    return new NoopSIEMForwarder();
    case 'datadog': return new DatadogSIEMForwarder(cfg);
    case 'syslog':  return new SyslogSIEMForwarder(cfg);
    default: {
      const _exhaustive: never = cfg;
      throw new Error(`Unknown SIEM provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Read a SIEM config from process env. Returns `noop` if nothing is
 * configured. This is deliberately tolerant: bad/partial config logs a
 * warning and falls back to noop rather than failing service startup.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SIEMConfig {
  const provider = (env.SIEM_PROVIDER ?? 'noop').toLowerCase() as SIEMProvider;
  if (provider === 'datadog') {
    const endpoint = env.SIEM_DATADOG_ENDPOINT ?? 'https://http-intake.logs.datadoghq.com/api/v2/logs';
    const apiKey = env.SIEM_DATADOG_API_KEY ?? env.DD_API_KEY;
    if (!apiKey) {
      logger.warn('SIEM_PROVIDER=datadog but no API key set; falling back to noop');
      return { provider: 'noop' };
    }
    return {
      provider: 'datadog',
      endpoint,
      apiKey,
      source: env.SIEM_DATADOG_SOURCE,
      service: env.SIEM_DATADOG_SERVICE,
    };
  }
  if (provider === 'syslog') {
    const host = env.SIEM_SYSLOG_HOST;
    if (!host) {
      logger.warn('SIEM_PROVIDER=syslog but no host set; falling back to noop');
      return { provider: 'noop' };
    }
    return {
      provider: 'syslog',
      host,
      port: env.SIEM_SYSLOG_PORT ? Number(env.SIEM_SYSLOG_PORT) : undefined,
      facility: env.SIEM_SYSLOG_FACILITY ? Number(env.SIEM_SYSLOG_FACILITY) : undefined,
      appName: env.SIEM_SYSLOG_APP_NAME,
    };
  }
  return { provider: 'noop' };
}

let singleton: SIEMForwarder | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 1.9: Per-org cache
// ─────────────────────────────────────────────────────────────────────────────
//
// `getSIEMForwarder(orgId)` reads `public.organizations.siem_config` and builds
// a forwarder per org. Results are cached for 5 min to avoid one DB round-trip
// per audit event. Cache key is the orgId; a tombstone `{ forwarder: null, … }`
// is cached for orgs with no config so we don't repeatedly hit the DB.
//
// The env singleton is unchanged and serves as the fallback whenever:
//   - no orgId is passed (background jobs, system-level events)
//   - the org has no siem_config row (typical for free-tier orgs)
//   - the DB lookup fails (graceful degradation — SIEM is best-effort)

const ORG_CACHE_TTL_MS = 5 * 60 * 1000;

type OrgCacheEntry = {
  /** null = tombstone (org has no siem_config → use env-fallback) */
  forwarder: SIEMForwarder | null;
  /** Actual provider label for metrics (env fallback uses env singleton's provider) */
  provider: SIEMProvider;
  expiresAt: number;
};

const orgCache = new Map<string, OrgCacheEntry>();

/**
 * Extract a per-org SIEMConfig from a `siem_config` JSONB value.
 *
 * - Validates the `provider` discriminator is one of the known values.
 * - Decrypts the `apiKey` field for datadog configs (stored with `enc:v1:` prefix).
 * - Returns `null` if the shape is invalid or unknown provider — caller
 *   falls back to env singleton.
 */
function configFromOrgRow(row: Record<string, unknown> | null): SIEMConfig | null {
  if (!row || typeof row !== 'object') return null;
  const provider = row.provider;
  if (provider === 'noop') return { provider: 'noop' };
  if (provider === 'datadog') {
    const endpoint = row.endpoint;
    const apiKeyRaw = row.apiKey;
    if (typeof endpoint !== 'string' || typeof apiKeyRaw !== 'string') return null;
    const apiKey = isEncrypted(apiKeyRaw) ? decrypt(apiKeyRaw) : apiKeyRaw;
    return {
      provider: 'datadog',
      endpoint,
      apiKey,
      source: typeof row.source === 'string' ? row.source : undefined,
      service: typeof row.service === 'string' ? row.service : undefined,
    };
  }
  if (provider === 'syslog') {
    const host = row.host;
    if (typeof host !== 'string') return null;
    return {
      provider: 'syslog',
      host,
      port: typeof row.port === 'number' ? row.port : undefined,
      facility: typeof row.facility === 'number' ? row.facility : undefined,
      appName: typeof row.appName === 'string' ? row.appName : undefined,
    };
  }
  return null;
}

async function loadOrgSIEMConfig(orgId: string): Promise<SIEMConfig | null> {
  try {
    const res = await queryPublic(
      'SELECT siem_config FROM public.organizations WHERE id = $1 LIMIT 1',
      [orgId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return configFromOrgRow(row.siem_config as Record<string, unknown> | null);
  } catch (err) {
    logger.warn('SIEM per-org config load failed — falling back to env', {
      operation: 'siem-forwarder',
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Return the SIEM forwarder that should fan-out events for this org.
 *
 * - Without `orgId`: returns the env-based singleton (sync, no cache).
 * - With `orgId` but no per-org config: returns the env-based singleton
 *   (cached tombstone → no repeated DB lookups).
 * - With `orgId` and a valid per-org config: returns a cached per-org forwarder.
 *
 * The return type is a Promise because the per-org path reads the DB and
 * decrypts the apiKey. Callers without an orgId can await either overload —
 * the sync env path never blocks.
 */
export function getSIEMForwarder(): SIEMForwarder;
// eslint-disable-next-line no-redeclare
export function getSIEMForwarder(orgId: string): Promise<SIEMForwarder>;
// eslint-disable-next-line no-redeclare
export function getSIEMForwarder(orgId?: string): SIEMForwarder | Promise<SIEMForwarder> {
  if (!singleton) {
    singleton = createSIEMForwarder(configFromEnv());
    logger.info('SIEM forwarder initialized', {
      operation: 'siem-forwarder',
      provider: singleton.provider,
    });
  }

  if (!orgId) return singleton;

  const now = Date.now();
  const cached = orgCache.get(orgId);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.forwarder ?? singleton);
  }

  return loadOrgSIEMConfig(orgId).then((cfg) => {
    if (cfg === null) {
      orgCache.set(orgId, {
        forwarder: null,
        provider: singleton!.provider,
        expiresAt: now + ORG_CACHE_TTL_MS,
      });
      return singleton!;
    }
    // Close any previous per-org forwarder to avoid leaking sockets/agents
    // when the org's config is rotated.
    cached?.forwarder?.close().catch(() => {/* ignore */});
    const forwarder = createSIEMForwarder(cfg);
    orgCache.set(orgId, {
      forwarder,
      provider: forwarder.provider,
      expiresAt: now + ORG_CACHE_TTL_MS,
    });
    return forwarder;
  });
}

/**
 * Invalidate the per-org cache so the next call re-reads the DB.
 * Called by the admin-UI endpoint after writing a new config.
 */
export function invalidateOrgSIEMCache(orgId?: string): void {
  if (!orgId) {
    for (const entry of orgCache.values()) {
      entry.forwarder?.close().catch(() => {/* ignore */});
    }
    orgCache.clear();
    return;
  }
  const entry = orgCache.get(orgId);
  if (entry) {
    entry.forwarder?.close().catch(() => {/* ignore */});
    orgCache.delete(orgId);
  }
}

export function resetSIEMForwarder(): void {
  if (singleton) {
    singleton.close().catch(() => { /* ignore */ });
  }
  singleton = null;
  invalidateOrgSIEMCache();
  tracker.reset();
}

/**
 * Return a snapshot of recent SIEM forwards — success/failure counters,
 * last record, last failure, and a capped ring buffer. Admin-only surface.
 */
export function getSIEMStatus(): SIEMStatus {
  return tracker.snapshot(getSIEMForwarder().provider);
}

// ===========================================
// Exports for testing
// ===========================================

export const _internals = {
  NoopSIEMForwarder,
  DatadogSIEMForwarder,
  SyslogSIEMForwarder,
  rfc5424Severity,
  configFromOrgRow,
  ORG_CACHE_TTL_MS,
};
