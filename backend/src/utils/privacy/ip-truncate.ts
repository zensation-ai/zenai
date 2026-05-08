/**
 * ip-truncate.ts — Sprint 1.9 Item 4 (GDPR privacy hardening)
 *
 * Truncates IP addresses before they hit persistent stores (user_sessions,
 * security_audit_log, consent_events). This is the classic GDPR-minimum:
 *
 *   - IPv4  →  /24  (last octet zeroed: 192.0.2.42 → 192.0.2.0)
 *   - IPv6  →  /64  (last 64 bits zeroed: 2001:db8::abcd → 2001:db8::)
 *
 * Rationale (Art. 5 / Art. 25 DSGVO — Datenminimierung + Privacy by Design):
 *   Raw IPs can fingerprint individuals, especially with IPv6's 64-bit host
 *   identifier. Most security use-cases (abuse detection, rate-limit keys,
 *   geolocation at city-level) work just as well with the network prefix.
 *
 * What stays unchanged:
 *   - `null` / unknown values pass through unchanged (callers still receive
 *     the "unknown" sentinel they expected).
 *   - The runtime rate-limiter uses req.ip only in memory and never writes
 *     the full IP to disk — that's a separate code path and intentionally
 *     not truncated, so we can still block a single attacker within the
 *     rolling window.
 *
 * Library note: we deliberately DO NOT pull in `ip-address` or `ipaddr.js`.
 * Both are heavyweight and their main value (subnet matching, protocol
 * detection) isn't needed here. The logic is simple and well-tested; the
 * edge cases (IPv4-mapped IPv6, loopback, dual-stack) are documented and
 * covered by unit tests in `backend/src/__tests__/unit/utils/ip-truncate.test.ts`.
 */

/** Token written when the caller couldn't determine an IP. Audit-logger historically uses this. */
export const UNKNOWN_IP_TOKEN = 'unknown';

/**
 * IPv4 dotted-quad recognizer. Only numeric octets 0-255. Deliberately
 * strict — falling through to "return as-is" is safer than false-positives.
 */
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * IPv4-mapped IPv6 recognizer (::ffff:192.0.2.1 family). The trailing IPv4
 * dotted-quad is the relevant host part; zero it like a plain IPv4 /24.
 */
const IPV4_MAPPED_IPV6_REGEX =
  /^(::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

function isValidOctet(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

function truncateIpv4(ip: string): string | null {
  const m = IPV4_REGEX.exec(ip);
  if (!m) return null;
  const [, a, b, c, d] = m;
  const octets = [a, b, c, d].map((s) => Number.parseInt(s, 10));
  if (!octets.every(isValidOctet)) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
}

/**
 * Truncates an IPv6 address to /64 — keeps the first 4 hextets (64 bits),
 * discards the rest.
 *
 * Accepts the canonical forms (full, compressed with `::`, uppercase/lowercase)
 * and IPv4-mapped variants. Rejects values with embedded garbage.
 */
function truncateIpv6(ip: string): string | null {
  // IPv4-mapped first (has embedded dotted-quad).
  const mapped = IPV4_MAPPED_IPV6_REGEX.exec(ip);
  if (mapped) {
    const truncatedV4 = truncateIpv4(mapped[2]);
    if (truncatedV4 === null) return null;
    return `${mapped[1]}${truncatedV4}`;
  }

  // Very cheap validity gate: must contain at least one colon and only
  // hex digits / colons. Scope IDs (%eth0) are stripped.
  const scopeIdx = ip.indexOf('%');
  const bare = scopeIdx === -1 ? ip : ip.slice(0, scopeIdx);
  if (!bare.includes(':')) return null;
  if (!/^[0-9a-f:]+$/i.test(bare)) return null;

  // Expand `::` into enough zero hextets so the address has 8 groups.
  // Then keep groups [0..3] and append '::' to represent the zeroed /64 tail.
  const doubleColonCount = (bare.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;

  let groups: string[];
  if (doubleColonCount === 1) {
    const [left, right] = bare.split('::');
    const leftGroups = left === '' ? [] : left.split(':');
    const rightGroups = right === '' ? [] : right.split(':');
    const missing = 8 - leftGroups.length - rightGroups.length;
    if (missing < 0) return null;
    groups = [...leftGroups, ...Array(missing).fill('0'), ...rightGroups];
  } else {
    groups = bare.split(':');
  }
  if (groups.length !== 8) return null;
  for (const g of groups) {
    if (g.length === 0 || g.length > 4) return null;
    if (!/^[0-9a-f]+$/i.test(g)) return null;
  }

  const prefix = groups.slice(0, 4).map((g) => g.toLowerCase()).join(':');
  return `${prefix}::`;
}

/**
 * Truncates an IP address to its GDPR-safe subnet-prefix. Returns the input
 * untouched for:
 *   - null / undefined
 *   - the sentinel `'unknown'`
 *   - non-string values (defensive — caller may pass a stored column)
 *   - values that don't parse as IPv4 or IPv6
 *
 * The "pass-through on invalid" behavior is intentional: legacy rows may
 * contain strings like `'localhost'` or `'cloudfront::forwarded-for'` that
 * we don't want to silently drop from the audit log. Callers that need
 * strict validation can compose with `isIpAddress()`.
 */
export function truncateIpAddress(ip: unknown): string | null {
  if (ip === null || ip === undefined) return null as string | null;
  if (typeof ip !== 'string') return null;
  const trimmed = ip.trim();
  if (trimmed === '') return null;
  if (trimmed.toLowerCase() === UNKNOWN_IP_TOKEN) return UNKNOWN_IP_TOKEN;

  const v4 = truncateIpv4(trimmed);
  if (v4 !== null) return v4;

  const v6 = truncateIpv6(trimmed);
  if (v6 !== null) return v6;

  // Not a parseable IP — pass-through unchanged so existing audit rows
  // don't lose their (already non-identifying) text.
  return trimmed;
}

/**
 * Returns true if the string parses as a concrete IPv4 or IPv6 address.
 * Used by tests and the ip-backfill script.
 */
export function isIpAddress(ip: unknown): boolean {
  if (typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  if (trimmed === '') return false;
  return truncateIpv4(trimmed) !== null || truncateIpv6(trimmed) !== null;
}

/**
 * Returns true iff the input, when truncated, equals itself. Useful to
 * decide whether a row in user_sessions / security_audit_log is already
 * in "truncated" form (so the backfill script can skip it).
 *
 * Note: `'unknown'` and non-IP strings are considered "already truncated"
 * since truncation is a no-op for them.
 */
export function isTruncated(ip: unknown): boolean {
  if (ip === null || ip === undefined) return true;
  if (typeof ip !== 'string') return true;
  const truncated = truncateIpAddress(ip);
  return truncated === ip.trim() || truncated === ip;
}
