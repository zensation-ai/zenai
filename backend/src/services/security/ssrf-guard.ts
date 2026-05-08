/**
 * SSRF Guard — Sprint 1.4, Security Week 4
 *
 * Centralized Server-Side Request Forgery protection.
 *
 * Extends the SSRF logic that previously lived only in `services/url-fetch.ts`
 * into a shared module so that every outbound HTTP call site uses identical
 * guardrails. Call sites: `url-fetch.ts`, `web-search.ts`, `mcp/mcp-transport.ts`,
 * and any future outbound fetcher.
 *
 * Blocks requests to:
 * - Loopback (127/8, 0/8, ::1)
 * - RFC 1918 private (10/8, 172.16–31/12, 192.168/16)
 * - Link-local (169.254/16, fe80::/10)
 * - Cloud metadata endpoints (169.254.169.254, metadata.google.internal, ...)
 * - IPv6 unique-local (fc00::/7)
 * - Known internal service hostnames (kubernetes.default, instance-data, ...)
 * - Non-HTTP(S) protocols
 *
 * Design notes:
 * - `assertPublicUrl(url)` is the thin, ergonomic primary API — throws on
 *   blocked URLs with a stable error code so callers can map to the correct
 *   HTTP response.
 * - DNS resolution is performed to protect against DNS rebinding. If DNS
 *   resolution fails we fall through (permissive) and let the network layer
 *   decide — this mirrors the pre-existing `url-fetch.ts` behaviour and
 *   avoids breaking valid fetches in environments with flaky DNS.
 *
 * @module services/security/ssrf-guard
 */
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import { logger } from '../../utils/logger';

/** Stable error codes, safe for external surfacing (no internal detail leaked). */
export const SSRF_ERROR_CODES = {
  INVALID_URL: 'SSRF_INVALID_URL',
  UNSUPPORTED_PROTOCOL: 'SSRF_UNSUPPORTED_PROTOCOL',
  BLOCKED_HOST: 'SSRF_BLOCKED_HOST',
  PRIVATE_IP: 'SSRF_PRIVATE_IP',
  METADATA_ENDPOINT: 'SSRF_METADATA_ENDPOINT',
} as const;

export type SsrfErrorCode = (typeof SSRF_ERROR_CODES)[keyof typeof SSRF_ERROR_CODES];

export class SsrfBlockedError extends Error {
  readonly code: SsrfErrorCode;
  readonly reason: string;

  constructor(code: SsrfErrorCode, reason: string) {
    super(`SSRF blocked: ${reason}`);
    this.name = 'SsrfBlockedError';
    this.code = code;
    this.reason = reason;
  }
}

/**
 * Private/internal IP ranges that must never be fetched.
 * Prevents SSRF attacks leaking cloud metadata, internal services,
 * or database credentials via DNS-rebinding-style attacks.
 */
const PRIVATE_IP_PATTERNS: readonly RegExp[] = [
  // IPv4 loopback + 0.0.0.0/8
  /^127\./,
  /^0\./,
  // IPv6 loopback
  /^::1$/,
  /^0:0:0:0:0:0:0:1$/,
  // IPv4 private ranges (RFC 1918)
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Link-local (IPv4 + IPv6)
  /^169\.254\./,
  /^fe80:/i,
  // IPv6 unique-local (fc00::/7 — covers fc00–fdff)
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  // IPv4-mapped IPv6 (::ffff:10.0.0.1 etc.) — handled after the IPv4 portion
  /^::ffff:127\./i,
  /^::ffff:10\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:169\.254\./i,
];

/** Hostnames that resolve to dangerous internal services. */
const BLOCKED_HOSTNAMES: readonly string[] = [
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
  // Sprint 1.5 pentest (2026-04-19): K8s in-cluster DNS zone. Anything
  // resolving under `*.cluster.local` is an in-cluster service and must not
  // be reachable from user-supplied URLs.
  'cluster.local',
];

/** Localhost-equivalent labels. */
const LOCALHOST_LABELS: readonly string[] = [
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
];

/** Check if an IP literal belongs to a private/internal range. */
export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * If `hostname` is an IPv4-mapped IPv6 address (`::ffff:…`), return the
 * equivalent IPv4 literal; otherwise null.
 *
 * Node's `URL` class normalizes `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]` —
 * the hex-packed form slips past the naive `^::ffff:127\.` regex in
 * PRIVATE_IP_PATTERNS. This helper decodes both the dotted form (`::ffff:a.b.c.d`)
 * and the hex-packed form (`::ffff:XXXX:YYYY`) back into a dotted IPv4 so the
 * existing IPv4 private-range logic applies uniformly.
 *
 * Sprint 1.5 pentest (2026-04-19): added to close the IPv4-mapped-IPv6 SSRF
 * bypass surfaced by `pentest-suite.ts`.
 */
export function ipv4MappedIpv6ToIpv4(hostname: string): string | null {
  const lower = hostname.toLowerCase();
  // Dotted form: `::ffff:127.0.0.1`
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (dotted) return dotted[1];
  // Hex-packed form after Node normalization: `::ffff:7f00:1`
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    if (Number.isNaN(high) || Number.isNaN(low)) return null;
    if (high > 0xffff || low > 0xffff) return null;
    return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
  }
  return null;
}

/** Check if a hostname maps to a hard-blocked metadata endpoint. */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some((h) => lower === h || lower.endsWith('.' + h));
}

/** Check if a hostname resolves to localhost. */
export function isLocalhost(hostname: string): boolean {
  return LOCALHOST_LABELS.includes(hostname.toLowerCase());
}

export interface SsrfCheckOptions {
  /**
   * If true, refuse non-HTTPS URLs. Default false (http is allowed).
   * Useful for production configs that should never call plain HTTP endpoints.
   */
  requireHttps?: boolean;
  /**
   * Skip DNS resolution (used in sync-only contexts or for tests).
   * Default false — DNS is resolved to prevent DNS rebinding.
   */
  skipDns?: boolean;
}

/**
 * Assert that `rawUrl` points at a safe, public endpoint.
 *
 * Throws `SsrfBlockedError` on any violation. Returns the parsed URL on success
 * so callers can reuse the parse result.
 */
export async function assertPublicUrl(
  rawUrl: string,
  options: SsrfCheckOptions = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(SSRF_ERROR_CODES.INVALID_URL, 'Invalid URL');
  }

  const protocol = parsed.protocol;
  if (options.requireHttps) {
    if (protocol !== 'https:') {
      throw new SsrfBlockedError(
        SSRF_ERROR_CODES.UNSUPPORTED_PROTOCOL,
        `Only HTTPS URLs are allowed (got ${protocol})`
      );
    }
  } else if (protocol !== 'http:' && protocol !== 'https:') {
    throw new SsrfBlockedError(
      SSRF_ERROR_CODES.UNSUPPORTED_PROTOCOL,
      `Only HTTP(S) URLs are supported (got ${protocol})`
    );
  }

  const rawHostname = parsed.hostname;
  if (!rawHostname) {
    throw new SsrfBlockedError(SSRF_ERROR_CODES.INVALID_URL, 'URL has no hostname');
  }

  // Node's URL class keeps IPv6 literals bracketed (`[::1]`). Strip the brackets
  // for the IP-family check below so `isIP` and our pattern matcher agree.
  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;

  if (isLocalhost(hostname)) {
    throw new SsrfBlockedError(
      SSRF_ERROR_CODES.BLOCKED_HOST,
      'Localhost access is not allowed'
    );
  }

  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(
      SSRF_ERROR_CODES.METADATA_ENDPOINT,
      `Blocked metadata hostname: ${hostname}`
    );
  }

  // If hostname is already an IP literal, validate directly.
  if (isIP(hostname)) {
    // IPv4-mapped IPv6: unwrap to the IPv4 equivalent so the private-range
    // check below catches `[::ffff:127.0.0.1]` (which Node normalizes to
    // `[::ffff:7f00:1]` — not matched by the raw-hex regexes above).
    const mapped = ipv4MappedIpv6ToIpv4(hostname);
    const effective = mapped ?? hostname;
    if (isPrivateIp(effective)) {
      throw new SsrfBlockedError(
        SSRF_ERROR_CODES.PRIVATE_IP,
        `Private/internal IP address not allowed: ${hostname}`
      );
    }
    return parsed;
  }

  if (options.skipDns) {
    return parsed;
  }

  // Resolve hostname to all A/AAAA addresses and validate each.
  // This closes DNS-rebinding attacks where a hostname first resolves to a
  // public IP (passing this check) but then resolves to a private IP on the
  // actual request. In practice both this guard AND axios-level restrictions
  // would be needed for full rebinding protection; this is the first line.
  try {
    const addresses = await dnsLookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        throw new SsrfBlockedError(
          SSRF_ERROR_CODES.PRIVATE_IP,
          `Hostname ${hostname} resolves to private IP ${addr.address}`
        );
      }
    }
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      throw err;
    }
    // DNS failure: fall through permissively — the downstream fetch will
    // surface the connection error. Mirrors the pre-existing behaviour in
    // url-fetch.ts so CI/test environments without full DNS aren't broken.
    logger.warn('SSRF DNS check failed (allowing fetch to proceed)', {
      operation: 'ssrf-guard',
      hostname,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return parsed;
}

/**
 * Non-throwing variant returning a structured result.
 * Useful where callers want to log the reason without exception handling.
 */
export async function checkPublicUrl(
  rawUrl: string,
  options: SsrfCheckOptions = {}
): Promise<
  | { safe: true; url: URL }
  | { safe: false; code: SsrfErrorCode; reason: string }
> {
  try {
    const url = await assertPublicUrl(rawUrl, options);
    return { safe: true, url };
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return { safe: false, code: err.code, reason: err.reason };
    }
    throw err;
  }
}
