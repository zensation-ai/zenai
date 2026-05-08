/**
 * Sprint 1.9 — IP-Truncate Unit-Tests
 *
 * Deckt IPv4 /24, IPv6 /64, IPv4-mapped IPv6, Edge-Cases (null, undefined,
 * 'unknown', non-String, invalid formats) und Idempotenz ab.
 */

import {
  truncateIpAddress,
  isIpAddress,
  isTruncated,
  UNKNOWN_IP_TOKEN,
} from '../../../../utils/privacy/ip-truncate';

describe('truncateIpAddress — IPv4 /24', () => {
  it('zeroes the last octet of a typical public IPv4', () => {
    expect(truncateIpAddress('203.0.113.42')).toBe('203.0.113.0');
  });

  it('zeroes RFC1918 private ranges', () => {
    expect(truncateIpAddress('192.168.1.100')).toBe('192.168.1.0');
    expect(truncateIpAddress('10.0.0.55')).toBe('10.0.0.0');
    expect(truncateIpAddress('172.16.200.1')).toBe('172.16.200.0');
  });

  it('preserves the zeroed form unchanged (idempotent)', () => {
    expect(truncateIpAddress('192.168.1.0')).toBe('192.168.1.0');
  });

  it('handles 0.0.0.0 and 255.255.255.255 edge boundaries', () => {
    expect(truncateIpAddress('0.0.0.0')).toBe('0.0.0.0');
    expect(truncateIpAddress('255.255.255.255')).toBe('255.255.255.0');
  });

  it('rejects out-of-range octets by passing through', () => {
    expect(truncateIpAddress('256.0.0.1')).toBe('256.0.0.1');
    expect(truncateIpAddress('192.168.1.999')).toBe('192.168.1.999');
  });

  it('rejects malformed IPv4 (too few octets) by passing through', () => {
    expect(truncateIpAddress('192.168.1')).toBe('192.168.1');
    expect(truncateIpAddress('1.2.3.4.5')).toBe('1.2.3.4.5');
  });
});

describe('truncateIpAddress — IPv6 /64', () => {
  it('keeps the first 4 hextets and zeroes the rest (compressed form)', () => {
    expect(truncateIpAddress('2001:db8:85a3::8a2e:370:7334')).toBe(
      '2001:db8:85a3:0::'
    );
  });

  it('handles full uncompressed notation', () => {
    expect(
      truncateIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')
    ).toBe('2001:0db8:85a3:0000::');
  });

  it('lowercases the output for consistency', () => {
    expect(truncateIpAddress('2001:DB8:ABCD:1234:5678:90AB:CDEF:1234')).toBe(
      '2001:db8:abcd:1234::'
    );
  });

  it('handles the loopback address ::1', () => {
    expect(truncateIpAddress('::1')).toBe('0:0:0:0::');
  });

  it('handles the unspecified address ::', () => {
    expect(truncateIpAddress('::')).toBe('0:0:0:0::');
  });

  it('handles IPv4-mapped IPv6 with the embedded IPv4 truncated', () => {
    expect(truncateIpAddress('::ffff:192.168.1.5')).toBe('::ffff:192.168.1.0');
    expect(truncateIpAddress('::192.168.1.5')).toBe('::192.168.1.0');
  });

  it('strips scope IDs (zone identifiers) before truncating', () => {
    expect(truncateIpAddress('fe80::1%eth0')).toBe('fe80:0:0:0::');
  });

  it('rejects multiple :: by passing through', () => {
    expect(truncateIpAddress('2001::db8::1')).toBe('2001::db8::1');
  });

  it('rejects hex-garbage IPv6 by passing through', () => {
    expect(truncateIpAddress('2001:xyz::1')).toBe('2001:xyz::1');
  });

  it('is idempotent on already-truncated /64 form', () => {
    const truncated = truncateIpAddress('2001:db8:85a3:0::')!;
    expect(truncateIpAddress(truncated)).toBe(truncated);
  });
});

describe('truncateIpAddress — edge cases', () => {
  it('returns null for null input', () => {
    expect(truncateIpAddress(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(truncateIpAddress(undefined)).toBeNull();
  });

  it('returns null for empty / whitespace-only string', () => {
    expect(truncateIpAddress('')).toBeNull();
    expect(truncateIpAddress('   ')).toBeNull();
  });

  it('preserves the "unknown" sentinel unchanged', () => {
    expect(truncateIpAddress('unknown')).toBe(UNKNOWN_IP_TOKEN);
    expect(truncateIpAddress('UNKNOWN')).toBe(UNKNOWN_IP_TOKEN);
  });

  it('returns null for non-string values', () => {
    expect(truncateIpAddress(42 as unknown)).toBeNull();
    expect(truncateIpAddress({ ip: '1.2.3.4' } as unknown)).toBeNull();
  });

  it('passes through arbitrary non-IP strings (legacy-audit-safety)', () => {
    expect(truncateIpAddress('localhost')).toBe('localhost');
    expect(truncateIpAddress('cloudfront-forwarded-for')).toBe(
      'cloudfront-forwarded-for'
    );
  });

  it('trims whitespace before truncating', () => {
    expect(truncateIpAddress('  192.168.1.5  ')).toBe('192.168.1.0');
  });
});

describe('isIpAddress', () => {
  it('returns true for valid IPv4', () => {
    expect(isIpAddress('192.168.1.1')).toBe(true);
  });

  it('returns true for valid IPv6', () => {
    expect(isIpAddress('2001:db8::1')).toBe(true);
  });

  it('returns true for IPv4-mapped IPv6', () => {
    expect(isIpAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('returns false for non-IP strings', () => {
    expect(isIpAddress('hello')).toBe(false);
    expect(isIpAddress('')).toBe(false);
    expect(isIpAddress('unknown')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isIpAddress(null)).toBe(false);
    expect(isIpAddress(undefined)).toBe(false);
    expect(isIpAddress(42)).toBe(false);
  });
});

describe('isTruncated', () => {
  it('returns true for already-truncated IPv4', () => {
    expect(isTruncated('192.168.1.0')).toBe(true);
  });

  it('returns false for a full IPv4', () => {
    expect(isTruncated('192.168.1.5')).toBe(false);
  });

  it('returns true for already-truncated IPv6', () => {
    expect(isTruncated('2001:db8:abcd:1234::')).toBe(true);
  });

  it('returns false for a full IPv6', () => {
    expect(isTruncated('2001:db8:abcd:1234:5678:90ab:cdef:1234')).toBe(false);
  });

  it('treats null / unknown / non-IP strings as already truncated (no-op)', () => {
    expect(isTruncated(null)).toBe(true);
    expect(isTruncated(undefined)).toBe(true);
    expect(isTruncated('unknown')).toBe(true);
    expect(isTruncated('localhost')).toBe(true);
  });
});
