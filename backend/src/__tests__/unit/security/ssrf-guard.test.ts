/**
 * SSRF Guard Tests — Sprint 1.4, Security Week 4
 *
 * Validates the centralized SSRF-protection module at `services/security/ssrf-guard.ts`.
 * Coverage goals (per Sprint 1.4 prompt):
 *   - 8+ private IPs rejected (IPv4 + IPv6)
 *   - public URLs accepted
 *   - localhost / metadata / non-https rejected
 */

// Mock DNS so tests are deterministic and offline.
jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

import { lookup as dnsLookup } from 'dns/promises';
import {
  assertPublicUrl,
  checkPublicUrl,
  isBlockedHostname,
  isLocalhost,
  isPrivateIp,
  SSRF_ERROR_CODES,
  SsrfBlockedError,
} from '../../../services/security/ssrf-guard';

const mockLookup = dnsLookup as unknown as jest.Mock;

function mockPublicDns() {
  mockLookup.mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ]);
}

function mockPrivateDns(address: string) {
  mockLookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
}

beforeEach(() => {
  mockLookup.mockReset();
});

describe('SSRF Guard — isPrivateIp', () => {
  it.each([
    ['127.0.0.1'],
    ['127.0.0.2'],
    ['10.0.0.1'],
    ['10.255.255.255'],
    ['172.16.0.1'],
    ['172.31.255.255'],
    ['192.168.1.1'],
    ['169.254.169.254'], // AWS metadata
    ['0.0.0.0'],
    ['::1'],
    ['fe80::1'],
    ['fc00::1'],
    ['fd12:3456::1'],
    ['::ffff:127.0.0.1'],
    ['::ffff:10.0.0.1'],
    ['::ffff:192.168.1.1'],
  ])('flags %s as private', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['93.184.216.34'],
    ['2606:4700:4700::1111'],
    ['172.32.0.1'], // Outside the /12
    ['172.15.255.255'], // Outside the /12
    ['11.0.0.1'],
    ['169.253.0.1'], // Just outside link-local
  ])('does not flag %s as private', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe('SSRF Guard — isBlockedHostname', () => {
  it.each([
    ['metadata.google.internal'],
    ['METADATA.GOOGLE.INTERNAL'],
    ['instance-data'],
    ['kubernetes.default'],
    ['kubernetes.default.svc'],
    ['foo.metadata.google.internal'],
  ])('blocks %s', (host) => {
    expect(isBlockedHostname(host)).toBe(true);
  });

  it.each([['example.com'], ['metadata-other.com'], ['docs.google.com']])(
    'does not block %s',
    (host) => {
      expect(isBlockedHostname(host)).toBe(false);
    }
  );
});

describe('SSRF Guard — isLocalhost', () => {
  it('flags localhost variants', () => {
    expect(isLocalhost('localhost')).toBe(true);
    expect(isLocalhost('LOCALHOST')).toBe(true);
    expect(isLocalhost('localhost.localdomain')).toBe(true);
    expect(isLocalhost('ip6-localhost')).toBe(true);
    expect(isLocalhost('ip6-loopback')).toBe(true);
  });

  it('does not flag other hostnames', () => {
    expect(isLocalhost('example.com')).toBe(false);
    expect(isLocalhost('my-localhost-clone.com')).toBe(false);
  });
});

describe('SSRF Guard — assertPublicUrl rejections', () => {
  it('rejects invalid URLs', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.INVALID_URL,
    });
  });

  it('rejects file:// protocol', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.UNSUPPORTED_PROTOCOL,
    });
  });

  it('rejects gopher:// protocol', async () => {
    await expect(assertPublicUrl('gopher://example.com')).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.UNSUPPORTED_PROTOCOL,
    });
  });

  it('rejects http when requireHttps is true', async () => {
    mockPublicDns();
    await expect(
      assertPublicUrl('http://example.com/x', { requireHttps: true })
    ).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.UNSUPPORTED_PROTOCOL,
    });
  });

  it('rejects localhost hostname', async () => {
    await expect(assertPublicUrl('http://localhost:8080/x')).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.BLOCKED_HOST,
    });
  });

  it('rejects metadata endpoint by hostname', async () => {
    await expect(
      assertPublicUrl('http://metadata.google.internal/computeMetadata/v1/')
    ).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.METADATA_ENDPOINT,
    });
  });

  it('rejects direct 127.0.0.1 IP literal', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:8080/x')).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.PRIVATE_IP,
    });
  });

  it('rejects direct 169.254.169.254 metadata IP literal', async () => {
    await expect(
      assertPublicUrl('http://169.254.169.254/latest/meta-data/')
    ).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.PRIVATE_IP,
    });
  });

  it('rejects IPv6 loopback literal', async () => {
    await expect(assertPublicUrl('http://[::1]:8080/')).rejects.toMatchObject({
      code: SSRF_ERROR_CODES.PRIVATE_IP,
    });
  });

  it('rejects DNS-resolved private IP (rebinding protection)', async () => {
    mockPrivateDns('10.0.0.42');
    await expect(
      assertPublicUrl('https://evil.example.com/path')
    ).rejects.toMatchObject({ code: SSRF_ERROR_CODES.PRIVATE_IP });
  });
});

describe('SSRF Guard — assertPublicUrl acceptances', () => {
  it('accepts public https URL', async () => {
    mockPublicDns();
    const url = await assertPublicUrl('https://example.com/api');
    expect(url.hostname).toBe('example.com');
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('accepts public http URL when requireHttps is false', async () => {
    mockPublicDns();
    const url = await assertPublicUrl('http://example.com/api', { requireHttps: false });
    expect(url.protocol).toBe('http:');
  });

  it('accepts public IP literal', async () => {
    const url = await assertPublicUrl('https://8.8.8.8/');
    expect(url.hostname).toBe('8.8.8.8');
    // IP literals skip DNS
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('accepts IPv6 public literal', async () => {
    const url = await assertPublicUrl('https://[2606:4700:4700::1111]/');
    // Node's URL keeps IPv6 brackets in .hostname — that's fine, the guard
    // strips them internally before validating.
    expect(url.hostname).toBe('[2606:4700:4700::1111]');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('skips DNS when skipDns option set', async () => {
    const url = await assertPublicUrl('https://example.com/api', { skipDns: true });
    expect(url.hostname).toBe('example.com');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('falls through permissively when DNS resolution fails', async () => {
    mockLookup.mockRejectedValue(new Error('EAI_AGAIN'));
    // Should not throw — the downstream fetch will fail naturally.
    await expect(assertPublicUrl('https://example.com/api')).resolves.toBeInstanceOf(URL);
  });
});

describe('SSRF Guard — checkPublicUrl (non-throwing variant)', () => {
  it('returns safe=true for public URLs', async () => {
    mockPublicDns();
    const result = await checkPublicUrl('https://example.com/api');
    expect(result.safe).toBe(true);
  });

  it('returns safe=false with reason for blocked URLs', async () => {
    const result = await checkPublicUrl('http://localhost/x');
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.code).toBe(SSRF_ERROR_CODES.BLOCKED_HOST);
      expect(result.reason).toContain('Localhost');
    }
  });

  it('returns safe=false for private IPs via DNS', async () => {
    mockPrivateDns('192.168.0.5');
    const result = await checkPublicUrl('https://internal-service.local/x');
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.code).toBe(SSRF_ERROR_CODES.PRIVATE_IP);
    }
  });
});

describe('SSRF Guard — SsrfBlockedError', () => {
  it('carries a stable code and reason', () => {
    const err = new SsrfBlockedError(SSRF_ERROR_CODES.PRIVATE_IP, 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SsrfBlockedError');
    expect(err.code).toBe(SSRF_ERROR_CODES.PRIVATE_IP);
    expect(err.reason).toBe('test');
    expect(err.message).toBe('SSRF blocked: test');
  });
});
