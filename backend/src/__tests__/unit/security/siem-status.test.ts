/**
 * Sprint 1.8 Commit 2: SIEM forwarder status tracker.
 *
 * Validates that each adapter (noop, datadog, syslog) records forward
 * attempts into the ring buffer, and that getSIEMStatus() exposes a
 * consistent snapshot.
 */

jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// checkedFetch is used by the Datadog adapter; provide a controllable mock.
const mockFetch = jest.fn();
jest.mock('../../../utils/checked-http', () => ({
  checkedFetch: (...args: unknown[]) => mockFetch(...args),
}));

import type { SecurityEvent } from '../../../services/security/audit-logger';
import {
  createSIEMForwarder,
  getSIEMStatus,
  resetSIEMForwarder,
  SIEM_STATUS_RING_SIZE,
} from '../../../services/security/siem-forwarder';

function mkEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: overrides.id ?? 'evt-1',
    event_type: overrides.event_type ?? 'login',
    user_id: overrides.user_id ?? 'u1',
    ip_address: overrides.ip_address,
    user_agent: overrides.user_agent,
    context: overrides.context ?? 'operations',
    severity: overrides.severity ?? 'info',
    details: overrides.details ?? {},
    created_at: overrides.created_at ?? new Date().toISOString(),
  } as SecurityEvent;
}

describe('SIEM forwarder status tracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSIEMForwarder();
  });

  it('records successful noop forwards', async () => {
    const fwd = createSIEMForwarder({ provider: 'noop' });
    await fwd.forward(mkEvent({ id: 'a' }));
    await fwd.forward(mkEvent({ id: 'b' }));

    const status = getSIEMStatus();
    expect(status.provider).toBe('noop');
    expect(status.successCount).toBe(2);
    expect(status.failureCount).toBe(0);
    expect(status.failureRate).toBe(0);
    expect(status.lastForward?.eventId).toBe('b');
    expect(status.recent).toHaveLength(2);
    expect(status.recent[0].eventId).toBe('b'); // most-recent first
  });

  it('records Datadog failures on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'upstream unhappy',
    });

    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://example.com/logs',
      apiKey: 'k',
    });
    await fwd.forward(mkEvent({ id: 'x', severity: 'critical' }));

    const status = getSIEMStatus();
    expect(status.provider).toBe('noop'); // singleton default for this test run
    // the tracker is shared across instances; failure of THIS forwarder was recorded
    expect(status.failureCount).toBe(1);
    expect(status.lastFailure?.error).toBe('HTTP 503');
    expect(status.recent[0].ok).toBe(false);
  });

  it('records Datadog success on 2xx', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });

    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://example.com/logs',
      apiKey: 'k',
    });
    await fwd.forward(mkEvent({ id: 'ok-1' }));

    const status = getSIEMStatus();
    expect(status.successCount).toBe(1);
    expect(status.failureCount).toBe(0);
    expect(status.lastForward?.ok).toBe(true);
  });

  it('records thrown errors as failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const fwd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://example.com/logs',
      apiKey: 'k',
    });
    await fwd.forward(mkEvent({ id: 'fail-1' }));

    const status = getSIEMStatus();
    expect(status.failureCount).toBe(1);
    expect(status.lastFailure?.error).toBe('network down');
  });

  it('caps the ring buffer at SIEM_STATUS_RING_SIZE', async () => {
    const fwd = createSIEMForwarder({ provider: 'noop' });
    const total = SIEM_STATUS_RING_SIZE + 12;
    for (let i = 0; i < total; i++) {
      await fwd.forward(mkEvent({ id: `e${i}` }));
    }

    const status = getSIEMStatus();
    expect(status.successCount).toBe(total);
    expect(status.recent.length).toBe(SIEM_STATUS_RING_SIZE);
    // newest first — the latest event id must be at position 0
    expect(status.recent[0].eventId).toBe(`e${total - 1}`);
  });

  it('computes failure rate correctly on mixed results', async () => {
    const fwd = createSIEMForwarder({ provider: 'noop' });
    await fwd.forward(mkEvent({ id: '1' })); // success
    await fwd.forward(mkEvent({ id: '2' })); // success

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' });
    const dd = createSIEMForwarder({
      provider: 'datadog',
      endpoint: 'https://example.com/logs',
      apiKey: 'k',
    });
    await dd.forward(mkEvent({ id: '3' })); // fail

    const status = getSIEMStatus();
    expect(status.successCount).toBe(2);
    expect(status.failureCount).toBe(1);
    expect(status.failureRate).toBeCloseTo(1 / 3, 5);
  });

  it('resetSIEMForwarder clears the tracker', async () => {
    const fwd = createSIEMForwarder({ provider: 'noop' });
    await fwd.forward(mkEvent({ id: 'a' }));
    expect(getSIEMStatus().successCount).toBe(1);

    resetSIEMForwarder();

    const status = getSIEMStatus();
    expect(status.successCount).toBe(0);
    expect(status.failureCount).toBe(0);
    expect(status.recent).toEqual([]);
    expect(status.lastForward).toBeNull();
  });
});
