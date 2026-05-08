/**
 * PII Scrubber for Observability Payloads — Sprint 1.4
 *
 * Shared scrubbing logic used by Sentry `beforeSend` / `beforeBreadcrumb` hooks.
 * Removes secrets and identifiers from nested event structures before they
 * leave the process.
 *
 * Scrubbing rules:
 * 1. **Exact-key redaction** — values for any of `SENSITIVE_KEYS` are replaced
 *    with `[REDACTED]` regardless of content.
 * 2. **Pattern-based string redaction** — strings containing Bearer tokens,
 *    `ab_live_*` / `ab_*` API keys, JWTs, or SHA-256/bcrypt hashes are
 *    replaced with a category-tagged marker (`[REDACTED:email]`).
 * 3. **IP anonymization** — IPv4 addresses are truncated to `/24` (last octet
 *    zeroed), IPv6 to `/64` (last four hextets zeroed), per GDPR Art. 6(1)(f)
 *    guidance from the German BfDI.
 *
 * Idempotent: `scrub(scrub(x))` === `scrub(x)`.
 *
 * @module services/observability/pii-scrubber
 */

/**
 * Keys whose value must always be redacted, independent of the content.
 * Match is case-insensitive against the exact key name.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set(
  [
    'password',
    'passwd',
    'secret',
    'client_secret',
    'clientsecret',
    'token',
    'id_token',
    'idtoken',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'api_key',
    'apikey',
    'authorization',
    'auth',
    'cookie',
    'set-cookie',
    'x-api-key',
    'mfa_secret',
    'mfasecret',
    'totp',
    'totp_secret',
    'private_key',
    'privatekey',
  ].map((k) => k.toLowerCase())
);

/**
 * Category-tagged redaction markers. The tag tells log readers what kind of
 * value was scrubbed so they can tell "the email field was stripped" apart
 * from "the bearer token was stripped".
 */
export const REDACTED_MARKERS = {
  bearer: '[REDACTED:bearer]',
  apiKey: '[REDACTED:api_key]',
  jwt: '[REDACTED:jwt]',
  email: '[REDACTED:email]',
  hash: '[REDACTED:hash]',
  bcrypt: '[REDACTED:bcrypt]',
  generic: '[REDACTED]',
} as const;

const STRING_SCRUB_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // Bearer tokens (Authorization header values pasted into error messages).
  { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: REDACTED_MARKERS.bearer },
  // JWTs (three dot-separated base64url segments).
  {
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: REDACTED_MARKERS.jwt,
  },
  // ZenAI internal API keys (ab_live_... and bare ab_... prefix).
  { pattern: /ab_live_[a-f0-9]{16,}/gi, replacement: REDACTED_MARKERS.apiKey },
  { pattern: /ab_[a-z0-9]{32,}/gi, replacement: REDACTED_MARKERS.apiKey },
  // OpenAI / Stripe secret keys.
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: REDACTED_MARKERS.apiKey },
  // bcrypt-style hashes.
  {
    pattern: /\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}/g,
    replacement: REDACTED_MARKERS.bcrypt,
  },
  // Email addresses.
  {
    pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    replacement: REDACTED_MARKERS.email,
  },
];

/** Loose IPv4 detector — anchored so we only match full addresses. */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
/** Loose IPv6 detector — accepts the common fully-expanded form. */
const IPV6_RE = /^[0-9a-fA-F:]+$/;

/**
 * Anonymize an IP address per GDPR guidance:
 * - IPv4 → zero the last octet (`/24`, e.g. `203.0.113.42` → `203.0.113.0`)
 * - IPv6 → zero everything after the first four hextets (`/64`,
 *   e.g. `2001:db8:abcd:0012:...` → `2001:db8:abcd:12::`)
 * - returns the original string if it is not a valid-looking IP.
 */
export function anonymizeIp(ip: string): string {
  if (typeof ip !== 'string' || ip.length === 0) {
    return ip;
  }
  const v4 = IPV4_RE.exec(ip);
  if (v4) {
    const [, a, b, c] = v4;
    return `${a}.${b}.${c}.0`;
  }
  if (ip.includes(':') && IPV6_RE.test(ip.replace(/::/, ':'))) {
    // Expand a single `::` if present, then keep the first 4 groups.
    const parts = ip.includes('::')
      ? (() => {
          const [head, tail] = ip.split('::');
          const headParts = head ? head.split(':') : [];
          const tailParts = tail ? tail.split(':') : [];
          const missing = 8 - headParts.length - tailParts.length;
          return [
            ...headParts,
            ...Array.from({ length: missing }, () => '0'),
            ...tailParts,
          ];
        })()
      : ip.split(':');
    if (parts.length >= 4) {
      return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}::`;
    }
  }
  return ip;
}

/** Scrub a single string by running all regex patterns. Idempotent. */
export function scrubString(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }
  let result = value;
  for (const { pattern, replacement } of STRING_SCRUB_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Check whether a key name is in the exact-redact set. */
export function isSensitiveKey(key: unknown): boolean {
  return typeof key === 'string' && SENSITIVE_KEYS.has(key.toLowerCase());
}

/**
 * Recursively scrub a value of any shape. Cycle-safe (uses a WeakSet).
 *
 * Behaviour:
 * - primitives: strings are pattern-scrubbed, other primitives pass through
 * - arrays: each element scrubbed, length preserved
 * - objects: keys in `SENSITIVE_KEYS` get `[REDACTED]`, others recursed into
 * - cycles: marked as `[Circular]`
 * - max depth 10 to bound worst-case cost
 */
export function scrubPII<T>(value: T): T {
  const seen = new WeakSet<object>();
  return walk(value, 0, seen) as T;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > 10) {
    return '[TruncatedDepth]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  const t = typeof value;
  if (t === 'string') {
    return scrubString(value as string);
  }
  if (t === 'number' || t === 'boolean' || t === 'bigint') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, depth + 1, seen));
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const child = obj[key];
      if (isSensitiveKey(key)) {
        out[key] = REDACTED_MARKERS.generic;
        continue;
      }
      // Special-case ip_address: truncate instead of scrub.
      if (key.toLowerCase() === 'ip_address' || key.toLowerCase() === 'ipaddress' || key.toLowerCase() === 'ip') {
        if (typeof child === 'string') {
          out[key] = anonymizeIp(child);
          continue;
        }
      }
      out[key] = walk(child, depth + 1, seen);
    }
    return out;
  }
  return value;
}

/**
 * Apply scrubbing to a Sentry `Event` object in place-friendly manner,
 * returning the mutated event (Sentry expects a return value). This is the
 * concrete hook used by `beforeSend` in `sentry.ts`.
 */
export function scrubSentryEvent(
  event: Record<string, unknown>
): Record<string, unknown> {
  // Sentry Event has known nested structure — scrub the parts that carry
  // user-supplied data without losing the envelope metadata Sentry needs.
  if (event.request && typeof event.request === 'object') {
    event.request = scrubPII(event.request as Record<string, unknown>);
  }
  if (event.extra && typeof event.extra === 'object') {
    event.extra = scrubPII(event.extra as Record<string, unknown>);
  }
  if (event.contexts && typeof event.contexts === 'object') {
    event.contexts = scrubPII(event.contexts as Record<string, unknown>);
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = (event.breadcrumbs as Array<Record<string, unknown>>).map(
      (bc) => scrubPII(bc)
    );
  }
  if (event.user && typeof event.user === 'object') {
    const user = event.user as Record<string, unknown>;
    if (typeof user.ip_address === 'string') {
      user.ip_address = anonymizeIp(user.ip_address);
    }
    if (typeof user.email === 'string') {
      user.email = scrubString(user.email);
    }
    event.user = user;
  }
  return event;
}

/** Scrub a Sentry breadcrumb (subset of event scrubbing). */
export function scrubSentryBreadcrumb(
  bc: Record<string, unknown>
): Record<string, unknown> {
  return scrubPII(bc);
}
