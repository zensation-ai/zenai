/**
 * Sentry PII Scrubber Tests — Sprint 1.4, Security Week 4
 *
 * Validates `services/observability/pii-scrubber.ts`:
 *   - exact-key redaction
 *   - regex redaction for email / Bearer / API key / JWT / bcrypt
 *   - IP anonymization on user.ip_address
 *   - nested breadcrumbs
 *   - idempotency
 *   - cycle safety
 */

import {
  scrubPII,
  scrubString,
  scrubSentryEvent,
  scrubSentryBreadcrumb,
  isSensitiveKey,
  anonymizeIp,
  REDACTED_MARKERS,
} from '../../../services/observability/pii-scrubber';

describe('PII Scrubber — isSensitiveKey', () => {
  it.each([
    'password',
    'PASSWORD',
    'Authorization',
    'cookie',
    'client_secret',
    'mfa_secret',
    'api_key',
    'apiKey',
    'totp',
    'private_key',
  ])('flags %s as sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['username', 'id', 'name', 'foo', ''])('does not flag %s', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });
});

describe('PII Scrubber — scrubString regex patterns', () => {
  it('redacts Bearer tokens', () => {
    expect(scrubString('Authorization: Bearer abcdef1234567890')).toBe(
      `Authorization: ${REDACTED_MARKERS.bearer}`
    );
  });

  it('redacts JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signatureAAAAAAAAAA';
    expect(scrubString(`token=${jwt}`)).toBe(`token=${REDACTED_MARKERS.jwt}`);
  });

  it('redacts ab_live_ API keys', () => {
    expect(scrubString('key=ab_live_0123456789abcdef0123456789abcdef')).toBe(
      `key=${REDACTED_MARKERS.apiKey}`
    );
  });

  it('redacts sk- API keys', () => {
    expect(scrubString('OpenAI: sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123')).toBe(
      `OpenAI: ${REDACTED_MARKERS.apiKey}`
    );
  });

  it('redacts bcrypt hashes', () => {
    const hash = '$2b$12$abcdefghijklmnopqrstuv0123456789ABCDEFGHIJKLMNOPQRSTU';
    expect(scrubString(`hash=${hash}`)).toBe(`hash=${REDACTED_MARKERS.bcrypt}`);
  });

  it('redacts email addresses', () => {
    expect(scrubString('user=alice@example.com,')).toBe(
      `user=${REDACTED_MARKERS.email},`
    );
  });

  it('leaves benign strings unchanged', () => {
    expect(scrubString('hello world')).toBe('hello world');
    expect(scrubString('')).toBe('');
  });
});

describe('PII Scrubber — anonymizeIp', () => {
  it('truncates IPv4 to /24', () => {
    expect(anonymizeIp('203.0.113.42')).toBe('203.0.113.0');
    expect(anonymizeIp('8.8.8.8')).toBe('8.8.8.0');
  });

  it('truncates IPv6 to /64', () => {
    expect(anonymizeIp('2001:db8:abcd:0012:0000:0000:0000:0001')).toBe(
      '2001:db8:abcd:0012::'
    );
  });

  it('expands :: shortcut then truncates', () => {
    expect(anonymizeIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd:12::');
  });

  it('returns non-IP input unchanged', () => {
    expect(anonymizeIp('not an ip')).toBe('not an ip');
    expect(anonymizeIp('')).toBe('');
  });
});

describe('PII Scrubber — scrubPII deep walk', () => {
  it('redacts by sensitive key regardless of value', () => {
    const out = scrubPII({ password: 'hunter2', ok: 'fine' });
    expect(out).toEqual({ password: REDACTED_MARKERS.generic, ok: 'fine' });
  });

  it('anonymizes ip_address field', () => {
    const out = scrubPII({ ip_address: '203.0.113.42', ok: 'fine' });
    expect(out).toEqual({ ip_address: '203.0.113.0', ok: 'fine' });
  });

  it('redacts pattern matches inside arbitrary string values', () => {
    const out = scrubPII({ message: 'failed for alice@example.com with Bearer abcdef1234' });
    expect(out.message).toContain(REDACTED_MARKERS.email);
    expect(out.message).toContain(REDACTED_MARKERS.bearer);
  });

  it('is cycle-safe', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const out = scrubPII(obj) as { a: number; self: string };
    expect(out.a).toBe(1);
    expect(out.self).toBe('[Circular]');
  });

  it('is idempotent', () => {
    const input = {
      authorization: 'Bearer xyz',
      email: 'a@b.de',
      nested: { token: 'abc', ip_address: '10.0.0.1' },
    };
    const once = scrubPII(input);
    const twice = scrubPII(once);
    expect(twice).toEqual(once);
  });

  it('bounds recursion depth', () => {
    // Build a 12-deep nested object.
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 12; i++) {
      deep = { child: deep };
    }
    const out = scrubPII(deep);
    // At depth 11, walk() short-circuits with '[TruncatedDepth]'.
    // We just assert it produces *some* truncation without exploding.
    const serialized = JSON.stringify(out);
    expect(serialized).toContain('TruncatedDepth');
  });

  it('preserves primitives', () => {
    expect(scrubPII(42)).toBe(42);
    expect(scrubPII(true)).toBe(true);
    expect(scrubPII(null)).toBe(null);
    expect(scrubPII(undefined)).toBe(undefined);
  });

  it('scrubs arrays', () => {
    const out = scrubPII(['alice@example.com', 'Bearer abc123def456', 'plain']);
    expect(out[0]).toBe(REDACTED_MARKERS.email);
    expect(out[1]).toBe(REDACTED_MARKERS.bearer);
    expect(out[2]).toBe('plain');
  });
});

describe('PII Scrubber — scrubSentryEvent', () => {
  it('scrubs request / extra / contexts', () => {
    const event = {
      request: { headers: { authorization: 'Bearer abcdef1234' } },
      extra: { password: 'hunter2' },
      contexts: { user_email: 'alice@example.com' },
      level: 'error',
    } as unknown as Record<string, unknown>;

    const out = scrubSentryEvent(event);
    expect(
      (out.request as Record<string, Record<string, unknown>>).headers.authorization
    ).toBe(REDACTED_MARKERS.generic);
    expect((out.extra as Record<string, unknown>).password).toBe(
      REDACTED_MARKERS.generic
    );
    expect((out.contexts as Record<string, unknown>).user_email).toBe(
      REDACTED_MARKERS.email
    );
    // Non-scrubbed fields survive.
    expect(out.level).toBe('error');
  });

  it('anonymizes user.ip_address and scrubs user.email', () => {
    const event = {
      user: { id: 'u1', ip_address: '203.0.113.42', email: 'alice@example.com' },
    } as unknown as Record<string, unknown>;
    const out = scrubSentryEvent(event);
    const user = out.user as Record<string, unknown>;
    expect(user.id).toBe('u1');
    expect(user.ip_address).toBe('203.0.113.0');
    expect(user.email).toBe(REDACTED_MARKERS.email);
  });

  it('scrubs nested breadcrumbs', () => {
    const event = {
      breadcrumbs: [
        { message: 'Fetched by Bearer abcdef1234', category: 'http' },
        { data: { password: 'hunter2' } },
      ],
    } as unknown as Record<string, unknown>;
    const out = scrubSentryEvent(event);
    const bcs = out.breadcrumbs as Array<Record<string, unknown>>;
    expect((bcs[0].message as string)).toContain(REDACTED_MARKERS.bearer);
    expect((bcs[1].data as Record<string, unknown>).password).toBe(
      REDACTED_MARKERS.generic
    );
  });

  it('tolerates missing fields', () => {
    const out = scrubSentryEvent({} as Record<string, unknown>);
    expect(out).toEqual({});
  });
});

describe('PII Scrubber — scrubSentryBreadcrumb', () => {
  it('scrubs a standalone breadcrumb', () => {
    const bc = {
      message: 'logged in alice@example.com',
      data: { token: 'abcdef' },
    } as unknown as Record<string, unknown>;
    const out = scrubSentryBreadcrumb(bc);
    expect(out.message).toContain(REDACTED_MARKERS.email);
    expect((out.data as Record<string, unknown>).token).toBe(REDACTED_MARKERS.generic);
  });
});
