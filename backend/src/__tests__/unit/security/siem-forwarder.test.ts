/**
 * Tests for the SIEM forwarder — covers config-from-env, the three
 * adapters (noop / datadog / syslog), the factory, and the RFC5424
 * syslog message shape.
 *
 * We do not open real UDP sockets; the syslog adapter's `buildMessage`
 * method is tested in isolation and the socket send path is exercised
 * against a local dgram receiver on port 0.
 */

import {
  createSIEMForwarder,
  configFromEnv,
  getSIEMForwarder,
  resetSIEMForwarder,
  invalidateOrgSIEMCache,
  _internals,
  type SIEMConfig,
} from '../../../services/security/siem-forwarder';
import type { SecurityEvent } from '../../../services/security/audit-logger';
import dgram from 'node:dgram';

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock the checked-http module so the Datadog adapter's outbound call is
// captured without making real network requests.
const mockCheckedFetch = jest.fn();
jest.mock('../../../utils/checked-http', () => ({
  checkedFetch: (...a: unknown[]) => mockCheckedFetch(...a),
}));

// Mock the DB so per-org cache tests don't touch Postgres.
const mockQueryPublic = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...a: unknown[]) => mockQueryPublic(...a),
}));

// Mock the field-encryption module so encrypt/decrypt are deterministic.
jest.mock('../../../services/security/field-encryption', () => ({
  encrypt: (plain: string) => `enc:v1:A::iv:tag:${Buffer.from(plain).toString('base64')}`,
  decrypt: (cipher: string) => {
    if (!cipher.startsWith('enc:v1:')) return cipher;
    const parts = cipher.split(':');
    return Buffer.from(parts[parts.length - 1], 'base64').toString('utf-8');
  },
  isEncrypted: (v: string) => typeof v === 'string' && v.startsWith('enc:v1:'),
}));

function makeEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: 'evt-1',
    event_type: 'failed_login',
    user_id: 'user-1',
    ip_address: '203.0.113.5',
    user_agent: 'jest/1.0',
    details: { attempt: 3 },
    severity: 'warning',
    context: 'operations',
    created_at: '2026-04-19T10:00:00.000Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// configFromEnv
// ─────────────────────────────────────────────

describe('siem-forwarder.configFromEnv', () => {
  it('defaults to noop when SIEM_PROVIDER is unset', () => {
    expect(configFromEnv({})).toEqual({ provider: 'noop' });
  });

  it('returns noop when SIEM_PROVIDER=noop', () => {
    expect(configFromEnv({ SIEM_PROVIDER: 'noop' })).toEqual({ provider: 'noop' });
  });

  it('returns a datadog config when keys are present', () => {
    const cfg = configFromEnv({
      SIEM_PROVIDER: 'datadog',
      SIEM_DATADOG_API_KEY: 'dd-key',
      SIEM_DATADOG_ENDPOINT: 'https://logs.example/api',
      SIEM_DATADOG_SOURCE: 'zenai-test',
      SIEM_DATADOG_SERVICE: 'zenai-test-api',
    });
    expect(cfg).toEqual({
      provider: 'datadog',
      endpoint: 'https://logs.example/api',
      apiKey: 'dd-key',
      source: 'zenai-test',
      service: 'zenai-test-api',
    });
  });

  it('falls back to noop when datadog is requested but no API key is set', () => {
    expect(configFromEnv({ SIEM_PROVIDER: 'datadog' })).toEqual({ provider: 'noop' });
  });

  it('accepts DD_API_KEY as an alias for the Datadog API key', () => {
    const cfg = configFromEnv({
      SIEM_PROVIDER: 'datadog',
      DD_API_KEY: 'from-dd',
    });
    expect((cfg as { provider: string; apiKey: string }).apiKey).toBe('from-dd');
  });

  it('returns a syslog config when host is present', () => {
    const cfg = configFromEnv({
      SIEM_PROVIDER: 'syslog',
      SIEM_SYSLOG_HOST: 'siem.example',
      SIEM_SYSLOG_PORT: '5140',
      SIEM_SYSLOG_FACILITY: '4',
      SIEM_SYSLOG_APP_NAME: 'zenai-test',
    });
    expect(cfg).toEqual({
      provider: 'syslog',
      host: 'siem.example',
      port: 5140,
      facility: 4,
      appName: 'zenai-test',
    });
  });

  it('falls back to noop when syslog is requested but no host is set', () => {
    expect(configFromEnv({ SIEM_PROVIDER: 'syslog' })).toEqual({ provider: 'noop' });
  });
});

// ─────────────────────────────────────────────
// createSIEMForwarder + adapters
// ─────────────────────────────────────────────

describe('siem-forwarder.createSIEMForwarder', () => {
  it('builds a noop forwarder', () => {
    const fwd = createSIEMForwarder({ provider: 'noop' });
    expect(fwd.provider).toBe('noop');
  });

  it('builds a datadog forwarder', () => {
    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://x',
      apiKey: 'k',
    });
    expect(fwd.provider).toBe('datadog');
  });

  it('builds a syslog forwarder', () => {
    const fwd = createSIEMForwarder({ provider: 'syslog', host: '127.0.0.1' });
    expect(fwd.provider).toBe('syslog');
  });

  it('rejects an unknown provider', () => {
    expect(() => createSIEMForwarder({ provider: 'mystery' as unknown as 'noop' } as SIEMConfig)).toThrow();
  });

  it('rejects a datadog config missing endpoint', () => {
    expect(() =>
      createSIEMForwarder({ provider: 'datadog', endpoint: '', apiKey: 'k' }),
    ).toThrow(/endpoint/);
  });

  it('rejects a datadog config missing apiKey', () => {
    expect(() =>
      createSIEMForwarder({ provider: 'datadog', endpoint: 'https://x', apiKey: '' }),
    ).toThrow(/apiKey/);
  });

  it('rejects a syslog config missing host', () => {
    expect(() => createSIEMForwarder({ provider: 'syslog', host: '' })).toThrow(/host/);
  });
});

// ─────────────────────────────────────────────
// Noop adapter
// ─────────────────────────────────────────────

describe('NoopSIEMForwarder', () => {
  it('forward() resolves without throwing', async () => {
    const fwd = createSIEMForwarder({ provider: 'noop' });
    await expect(fwd.forward(makeEvent())).resolves.toBeUndefined();
  });

  it('close() is a no-op', async () => {
    const fwd = createSIEMForwarder({ provider: 'noop' });
    await expect(fwd.close()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Datadog adapter
// ─────────────────────────────────────────────

describe('DatadogSIEMForwarder', () => {
  beforeEach(() => {
    mockCheckedFetch.mockReset();
  });

  it('sends a POST with DD-API-KEY header to the configured endpoint', async () => {
    mockCheckedFetch.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://logs.example/api/v2/logs',
      apiKey: 'secret-dd',
      source: 'zenai-test',
    });

    await fwd.forward(makeEvent({ severity: 'critical' }));

    expect(mockCheckedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockCheckedFetch.mock.calls[0];
    expect(url).toBe('https://logs.example/api/v2/logs');
    expect(init.method).toBe('POST');
    expect(init.headers['DD-API-KEY']).toBe('secret-dd');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.ddsource).toBe('zenai-test');
    expect(body.status).toBe('error');
    expect(body.event.event_type).toBe('failed_login');
  });

  it('maps severity to Datadog status (warning → warn, info → info)', async () => {
    mockCheckedFetch.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://x',
      apiKey: 'k',
    });

    await fwd.forward(makeEvent({ severity: 'warning' }));
    const warnBody = JSON.parse(mockCheckedFetch.mock.calls[0][1].body);
    expect(warnBody.status).toBe('warn');

    await fwd.forward(makeEvent({ severity: 'info' }));
    const infoBody = JSON.parse(mockCheckedFetch.mock.calls[1][1].body);
    expect(infoBody.status).toBe('info');
  });

  it('swallows non-2xx responses without throwing', async () => {
    mockCheckedFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://x',
      apiKey: 'k',
    });

    await expect(fwd.forward(makeEvent())).resolves.toBeUndefined();
  });

  it('swallows network errors without throwing', async () => {
    mockCheckedFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://x',
      apiKey: 'k',
    });

    await expect(fwd.forward(makeEvent())).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Syslog adapter (RFC5424 shape + UDP round-trip on localhost)
// ─────────────────────────────────────────────

describe('SyslogSIEMForwarder.buildMessage', () => {
  it('builds an RFC5424 header with the correct PRI for critical events', () => {
    const fwd = new _internals.SyslogSIEMForwarder({
      provider: 'syslog',
      host: '127.0.0.1',
      facility: 13,
      appName: 'zenai-test',
    });
    const msg = fwd.buildMessage(makeEvent({ severity: 'critical' }));
    // facility 13, severity 2 (critical) → PRI = 13*8 + 2 = 106
    expect(msg.startsWith('<106>1 ')).toBe(true);
    expect(msg).toContain(' zenai-test ');
    expect(msg).toContain('"id":"evt-1"');
    expect(msg).toContain('"severity":"critical"');
  });

  it('maps info severity to RFC5424 severity 6', () => {
    const fwd = new _internals.SyslogSIEMForwarder({
      provider: 'syslog',
      host: '127.0.0.1',
      facility: 1,
    });
    const msg = fwd.buildMessage(makeEvent({ severity: 'info' }));
    // facility 1, severity 6 (info) → PRI = 1*8 + 6 = 14
    expect(msg.startsWith('<14>1 ')).toBe(true);
  });

  it('maps warning severity to RFC5424 severity 4', () => {
    expect(_internals.rfc5424Severity('warning')).toBe(4);
    expect(_internals.rfc5424Severity('critical')).toBe(2);
    expect(_internals.rfc5424Severity('info')).toBe(6);
  });
});

describe('SyslogSIEMForwarder (UDP round-trip)', () => {
  it('delivers a datagram to a local dgram receiver', async () => {
    const receiver = dgram.createSocket('udp4');
    const received: string[] = [];
    const onMsg = new Promise<void>((resolve) => {
      receiver.on('message', (buf) => {
        received.push(buf.toString('utf-8'));
        resolve();
      });
    });
    await new Promise<void>((resolve) => receiver.bind(0, '127.0.0.1', resolve));
    const addr = receiver.address() as { port: number };

    const fwd = createSIEMForwarder({
      provider: 'syslog',
      host: '127.0.0.1',
      port: addr.port,
      appName: 'zenai-test',
    });

    await fwd.forward(makeEvent({ severity: 'critical' }));
    // Wait up to 500ms for the datagram to arrive.
    await Promise.race([
      onMsg,
      new Promise<void>((r) => setTimeout(r, 500)),
    ]);

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]).toMatch(/^<\d+>1 /);
    expect(received[0]).toContain('"id":"evt-1"');

    await fwd.close();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  });

  it('close() is safe to call when no socket has been opened', async () => {
    const fwd = createSIEMForwarder({ provider: 'syslog', host: '127.0.0.1' });
    await expect(fwd.close()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Singleton management
// ─────────────────────────────────────────────

describe('getSIEMForwarder singleton', () => {
  afterEach(() => resetSIEMForwarder());

  it('returns the same instance on repeated calls', () => {
    const a = getSIEMForwarder();
    const b = getSIEMForwarder();
    expect(a).toBe(b);
  });

  it('resetSIEMForwarder lets the next call build a fresh instance', () => {
    const a = getSIEMForwarder();
    resetSIEMForwarder();
    const b = getSIEMForwarder();
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────────────────────────
// Sprint 1.9: per-org config + cache
// ─────────────────────────────────────────────

describe('getSIEMForwarder per-org config', () => {
  afterEach(() => {
    resetSIEMForwarder();
    mockQueryPublic.mockReset();
  });

  it('falls back to env singleton when the org has no config', async () => {
    mockQueryPublic.mockResolvedValue({ rows: [{ siem_config: null }] });
    const envFwd = getSIEMForwarder();
    const orgFwd = await getSIEMForwarder('org-1');
    expect(orgFwd).toBe(envFwd);
    expect(mockQueryPublic).toHaveBeenCalledTimes(1);
  });

  it('falls back to env singleton when the org does not exist', async () => {
    mockQueryPublic.mockResolvedValue({ rows: [] });
    const envFwd = getSIEMForwarder();
    const orgFwd = await getSIEMForwarder('missing-org');
    expect(orgFwd).toBe(envFwd);
  });

  it('builds a per-org datadog forwarder from valid config', async () => {
    mockQueryPublic.mockResolvedValue({
      rows: [{
        siem_config: {
          provider: 'datadog',
          endpoint: 'https://logs.example/api',
          apiKey: 'enc:v1:A::iv:tag:' + Buffer.from('secret').toString('base64'),
          source: 'per-org',
        },
      }],
    });
    const fwd = await getSIEMForwarder('org-42');
    expect(fwd.provider).toBe('datadog');
    // Not the env singleton (noop by default)
    expect(fwd).not.toBe(getSIEMForwarder());
  });

  it('caches the org forwarder across calls within TTL', async () => {
    mockQueryPublic.mockResolvedValue({
      rows: [{ siem_config: { provider: 'syslog', host: 'siem.internal' } }],
    });
    const first = await getSIEMForwarder('org-7');
    const second = await getSIEMForwarder('org-7');
    expect(first).toBe(second);
    expect(mockQueryPublic).toHaveBeenCalledTimes(1);
  });

  it('caches the tombstone (no config) to avoid repeated DB hits', async () => {
    mockQueryPublic.mockResolvedValue({ rows: [{ siem_config: null }] });
    await getSIEMForwarder('org-9');
    await getSIEMForwarder('org-9');
    expect(mockQueryPublic).toHaveBeenCalledTimes(1);
  });

  it('invalidateOrgSIEMCache forces a re-read on next call', async () => {
    mockQueryPublic.mockResolvedValue({
      rows: [{ siem_config: { provider: 'syslog', host: 'host-a' } }],
    });
    await getSIEMForwarder('org-99');
    invalidateOrgSIEMCache('org-99');
    mockQueryPublic.mockResolvedValue({
      rows: [{ siem_config: { provider: 'syslog', host: 'host-b' } }],
    });
    await getSIEMForwarder('org-99');
    expect(mockQueryPublic).toHaveBeenCalledTimes(2);
  });

  it('invalidateOrgSIEMCache() with no arg clears all orgs', async () => {
    mockQueryPublic.mockResolvedValue({
      rows: [{ siem_config: { provider: 'syslog', host: 'host-x' } }],
    });
    await getSIEMForwarder('org-a');
    await getSIEMForwarder('org-b');
    invalidateOrgSIEMCache();
    await getSIEMForwarder('org-a');
    await getSIEMForwarder('org-b');
    expect(mockQueryPublic).toHaveBeenCalledTimes(4);
  });

  it('falls back to env when the DB query throws', async () => {
    mockQueryPublic.mockRejectedValue(new Error('conn reset'));
    const envFwd = getSIEMForwarder();
    const fwd = await getSIEMForwarder('org-err');
    expect(fwd).toBe(envFwd);
  });

  it('rejects invalid config shape (missing datadog.endpoint) and falls back', async () => {
    mockQueryPublic.mockResolvedValue({
      rows: [{ siem_config: { provider: 'datadog', apiKey: 'k' } }],
    });
    const envFwd = getSIEMForwarder();
    const fwd = await getSIEMForwarder('org-bad');
    expect(fwd).toBe(envFwd);
  });
});

describe('configFromOrgRow (internal)', () => {
  const { configFromOrgRow } = _internals as {
    configFromOrgRow: (row: Record<string, unknown> | null) => SIEMConfig | null;
  };

  it('returns null for null input', () => {
    expect(configFromOrgRow(null)).toBeNull();
  });

  it('returns null for unknown provider', () => {
    expect(configFromOrgRow({ provider: 'kafka' })).toBeNull();
  });

  it('builds a noop config from {provider: noop}', () => {
    expect(configFromOrgRow({ provider: 'noop' })).toEqual({ provider: 'noop' });
  });

  it('decrypts the apiKey when it has the enc:v1: prefix', () => {
    const encCipher = 'enc:v1:A::iv:tag:' + Buffer.from('plain-key').toString('base64');
    const cfg = configFromOrgRow({
      provider: 'datadog',
      endpoint: 'https://x',
      apiKey: encCipher,
    });
    expect(cfg).toEqual({
      provider: 'datadog',
      endpoint: 'https://x',
      apiKey: 'plain-key',
      source: undefined,
      service: undefined,
    });
  });

  it('accepts a syslog config without optional fields', () => {
    const cfg = configFromOrgRow({ provider: 'syslog', host: 'h' });
    expect(cfg).toEqual({
      provider: 'syslog',
      host: 'h',
      port: undefined,
      facility: undefined,
      appName: undefined,
    });
  });
});
