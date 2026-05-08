/**
 * Sprint 1.9 — session-store IP-truncation integration
 *
 * Verifies that `sessionStore.createSession` truncates the ip_address at the
 * boundary (just before the INSERT). This is the "write-site enforcement"
 * that complements the `truncateIpAddress` unit tests — we want to make
 * sure the call site actually applies the helper, not just that the helper
 * works in isolation.
 */

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sessionStore } from '../../../../services/auth/session-store';

describe('sessionStore.createSession — Sprint 1.9 IP truncation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  function baseInput(ip: string | null): Parameters<typeof sessionStore.createSession>[0] {
    return {
      userId: 'usr_1',
      refreshTokenHash: 'abc123',
      deviceInfo: {},
      ipAddress: ip,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    };
  }

  it('truncates a full IPv4 to /24 before insert', async () => {
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'sess_1' }] });
    await sessionStore.createSession(baseInput('203.0.113.42'));

    expect(mockQueryPublic).toHaveBeenCalledTimes(1);
    const params = mockQueryPublic.mock.calls[0][1];
    expect(params[3]).toBe('203.0.113.0');
  });

  it('truncates a full IPv6 to /64 before insert', async () => {
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'sess_1' }] });
    await sessionStore.createSession(
      baseInput('2001:db8:85a3:1234:5678:8a2e:370:7334')
    );

    const params = mockQueryPublic.mock.calls[0][1];
    expect(params[3]).toBe('2001:db8:85a3:1234::');
  });

  it('passes null through unchanged when no IP is provided', async () => {
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'sess_1' }] });
    await sessionStore.createSession(baseInput(null));

    const params = mockQueryPublic.mock.calls[0][1];
    expect(params[3]).toBeNull();
  });

  it('is idempotent: an already-truncated IP stays as-is', async () => {
    mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'sess_1' }] });
    await sessionStore.createSession(baseInput('192.168.1.0'));

    const params = mockQueryPublic.mock.calls[0][1];
    expect(params[3]).toBe('192.168.1.0');
  });
});
