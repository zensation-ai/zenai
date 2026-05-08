/**
 * Logger Sanitizer Tests — Sprint 1.4, Security Week 4
 *
 * Complements the existing `sensitive-data-filter.test.ts` with coverage of
 * the Sprint 1.4 additions:
 *   - `sanitizeMeta()` public wrapper (idempotent, cycle-safe)
 *   - IP-field anonymization (IPv4 /24, IPv6 /64)
 *   - JWT / ab_ / email pattern redaction inside message strings
 *   - circular-reference handling
 *   - non-mutating behaviour (returns new objects, does not touch input)
 */

import { sanitizeMeta, anonymizeIp } from '../../../utils/logger';

describe('Logger Sanitizer — sanitizeMeta idempotency', () => {
  it('is idempotent across scalar fields', () => {
    const input = {
      email: 'alice@example.com',
      authorization: 'Bearer super-secret-token-1234',
      ip: '203.0.113.42',
    };
    const once = sanitizeMeta(input);
    const twice = sanitizeMeta(once);
    expect(twice).toEqual(once);
  });

  it('is idempotent across nested structures', () => {
    const input = {
      req: {
        headers: { authorization: 'Bearer xyz' },
        body: { email: 'bob@example.de', pw: 'hunter2' },
      },
      clientIp: '10.0.0.5',
    };
    const once = sanitizeMeta(input);
    const twice = sanitizeMeta(once);
    expect(twice).toEqual(once);
  });
});

describe('Logger Sanitizer — IP anonymization', () => {
  it('anonymizes ip field to /24', () => {
    const out = sanitizeMeta({ ip: '203.0.113.42' }) as { ip: string };
    expect(out.ip).toBe('203.0.113.0');
  });

  it('anonymizes ip_address field to /24', () => {
    const out = sanitizeMeta({ ip_address: '8.8.8.8' }) as { ip_address: string };
    expect(out.ip_address).toBe('8.8.8.0');
  });

  it('anonymizes IPv6 to /64', () => {
    const out = sanitizeMeta({ clientIp: '2001:db8:abcd:0012:0000:0000:0000:0001' }) as {
      clientIp: string;
    };
    expect(out.clientIp).toBe('2001:db8:abcd:0012::');
  });

  it('anonymizeIp is exported and handles edge cases', () => {
    expect(anonymizeIp('not-an-ip')).toBe('not-an-ip');
    expect(anonymizeIp('')).toBe('');
    expect(anonymizeIp('127.0.0.1')).toBe('127.0.0.0');
  });
});

describe('Logger Sanitizer — pattern redaction inside strings', () => {
  it('redacts JWT embedded in a message field', () => {
    const out = sanitizeMeta({
      message:
        'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signatureAAAAAAAAAA after rotation',
    }) as { message: string };
    expect(out.message).toContain('[REDACTED:jwt]');
    expect(out.message).not.toContain('eyJhbGci');
  });

  it('redacts ab_ API keys inside arbitrary strings', () => {
    const out = sanitizeMeta({
      note: 'The key ab_0123456789abcdef0123456789abcdef01 was rotated',
    }) as { note: string };
    expect(out.note).toContain('ab_[REDACTED]');
    expect(out.note).not.toContain('ab_012345');
  });

  it('redacts email addresses inside message strings', () => {
    const out = sanitizeMeta({ message: 'Login failed for alice@example.de' }) as {
      message: string;
    };
    expect(out.message).toContain('[REDACTED:email]');
    expect(out.message).not.toContain('alice@example');
  });

  it('redacts Bearer tokens inline', () => {
    const out = sanitizeMeta({ message: 'Authorization: Bearer abc123xyz789 failed' }) as {
      message: string;
    };
    expect(out.message).toContain('Bearer [REDACTED]');
  });
});

describe('Logger Sanitizer — circular references', () => {
  it('does not throw on self-referencing object', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => sanitizeMeta(obj)).not.toThrow();
  });

  it('marks repeat references as [Circular]', () => {
    const shared: Record<string, unknown> = { password: 'hunter2' };
    const wrapper = { first: shared, second: shared };
    const out = sanitizeMeta(wrapper) as { first: unknown; second: unknown };
    // First occurrence is scrubbed normally.
    expect((out.first as Record<string, unknown>).password).toBe('[REDACTED]');
    // Second occurrence is flagged as Circular (same object reference).
    expect(out.second).toBe('[Circular]');
  });

  it('does not stack-overflow on deep self-reference', () => {
    const parent: Record<string, unknown> = {};
    let current = parent;
    for (let i = 0; i < 50; i++) {
      current.next = { idx: i };
      current = current.next as Record<string, unknown>;
    }
    current.back = parent; // close the loop
    expect(() => sanitizeMeta(parent)).not.toThrow();
  });
});

describe('Logger Sanitizer — non-mutating', () => {
  it('returns a new object without touching input', () => {
    const input = { password: 'hunter2', ip: '203.0.113.42' };
    const before = JSON.stringify(input);
    sanitizeMeta(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('Logger Sanitizer — large payloads', () => {
  it('handles 1 MB-ish payloads without throwing', () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
      big[`field_${i}`] = `value_${i}_with_email_${i}@example.com`;
    }
    const out = sanitizeMeta(big) as Record<string, string>;
    // Spot-check a few scrubbed entries.
    for (let i = 0; i < 5; i++) {
      expect(out[`field_${i}`]).toContain('[REDACTED:email]');
    }
  });
});
