/**
 * PII Scrubber for Frontend Observability — Sprint 1.4
 *
 * Mirror of `backend/src/services/observability/pii-scrubber.ts` adapted for
 * the browser. Applied inside Sentry `beforeSend` and `beforeBreadcrumb` hooks.
 *
 * Frontend-specific concerns we also defend against:
 * - `localStorage` / `sessionStorage` dumps appearing in error context
 * - `document.cookie` landing in breadcrumb data
 * - URL query strings containing `access_token` / `id_token` (OAuth implicit)
 *
 * Logic is kept minimal and dependency-free — no imports from backend.
 *
 * @module services/pii-scrubber
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
    // Browser-specific storage labels that occasionally get captured
    'localstorage',
    'sessionstorage',
  ].map((k) => k.toLowerCase())
);

export const REDACTED_MARKERS = {
  bearer: '[REDACTED:bearer]',
  apiKey: '[REDACTED:api_key]',
  jwt: '[REDACTED:jwt]',
  email: '[REDACTED:email]',
  generic: '[REDACTED]',
} as const;

const STRING_SCRUB_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: REDACTED_MARKERS.bearer },
  {
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: REDACTED_MARKERS.jwt,
  },
  { pattern: /ab_live_[a-f0-9]{16,}/gi, replacement: REDACTED_MARKERS.apiKey },
  { pattern: /ab_[a-z0-9]{32,}/gi, replacement: REDACTED_MARKERS.apiKey },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: REDACTED_MARKERS.apiKey },
  {
    pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    replacement: REDACTED_MARKERS.email,
  },
];

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

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

export function isSensitiveKey(key: unknown): boolean {
  return typeof key === 'string' && SENSITIVE_KEYS.has(key.toLowerCase());
}

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

export function scrubSentryEvent(
  event: Record<string, unknown>
): Record<string, unknown> {
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

export function scrubSentryBreadcrumb(
  bc: Record<string, unknown>
): Record<string, unknown> {
  return scrubPII(bc);
}
