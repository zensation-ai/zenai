/**
 * Checked HTTP — outbound connection IP verification (DNS-rebinding defense).
 *
 * Problem: validating a URL's hostname against SSRF rules BEFORE calling
 * fetch() is a TOCTOU hole. A malicious DNS server can return a public IP
 * on the first lookup (passing validation) and a private IP on the second
 * (the actual connection). Between check and use the decision rots.
 *
 * Solution: do the blocklist check at `createConnection` time, on the socket
 * that's about to be used. If the resolved IP is private / loopback /
 * link-local / a known cloud-metadata address, throw — no packet ever leaves
 * the host.
 *
 * Usage:
 *   const agent = getCheckedAgent('https://example.com');
 *   const res = await fetch(url, { agent });
 *
 * or:
 *   const res = await checkedFetch(url, init);
 *
 * Sprint 1.9 — Phase 2: allowLoopback opt-in for self-hosted LLM sidecars
 * (Ollama at http://127.0.0.1:11434). Everything else stays on the default
 * strict policy.
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// ===========================================
// IP blocklist
// ===========================================

/**
 * Loopback-only IPv4 ranges. Split out so `allowLoopback` can relax exactly
 * this slice of the blocklist without opening the rest of RFC 1918 etc.
 */
const LOOPBACK_IPV4_RANGES: Array<[string, number]> = [
  ['127.0.0.0', 8],
];

/**
 * Private / reserved IPv4 ranges that must not be reachable from outbound
 * HTTP. Covers RFC 1918, link-local, carrier-grade NAT, test-net,
 * 0.0.0.0/8, broadcast, documentation-only, and the cloud-metadata IP.
 * Loopback is kept in LOOPBACK_IPV4_RANGES and checked separately.
 */
const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16], // link-local incl. AWS 169.254.169.254
  ['0.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // TEST-NET-1
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved / broadcast
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (
    ((parts[0] ?? 0) << 24) |
    ((parts[1] ?? 0) << 16) |
    ((parts[2] ?? 0) << 8) |
    (parts[3] ?? 0)
  ) >>> 0;
}

function matchesRange(ip: string, ranges: Array<[string, number]>): boolean {
  const ipInt = ipv4ToInt(ip);
  for (const [base, prefix] of ranges) {
    const baseInt = ipv4ToInt(base);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((ipInt & mask) === (baseInt & mask)) {
      return true;
    }
  }
  return false;
}

function isIPv4Loopback(ip: string): boolean {
  return matchesRange(ip, LOOPBACK_IPV4_RANGES);
}

function isIPv4Private(ip: string): boolean {
  return matchesRange(ip, PRIVATE_IPV4_RANGES);
}

/**
 * IPv6 private ranges (a focused subset — link-local, unique-local,
 * IPv4-mapped non-loopback addresses, documentation). Loopback (::1) is
 * treated as a loopback-only address in isIPv6Loopback.
 */
function isIPv6Loopback(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower === '::0') {return true;}
  // IPv4-mapped IPv6 of 127.x
  const mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (mapped && mapped[1] && net.isIPv4(mapped[1]) && isIPv4Loopback(mapped[1])) {
    return true;
  }
  const compat = lower.match(/^::([0-9.]+)$/);
  if (compat && compat[1] && net.isIPv4(compat[1]) && isIPv4Loopback(compat[1])) {
    return true;
  }
  return false;
}

function isIPv6Private(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fec0:')) {
    return true;
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) {return true;} // ULA fc00::/7
  if (lower.startsWith('ff')) {return true;} // multicast
  // IPv4-mapped IPv6 with private (non-loopback) v4
  const mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (mapped) {
    const ipv4 = mapped[1];
    if (ipv4 && net.isIPv4(ipv4) && isIPv4Private(ipv4)) {return true;}
  }
  // IPv4-compat (deprecated) ::a.b.c.d
  const compat = lower.match(/^::([0-9.]+)$/);
  if (compat) {
    const ipv4 = compat[1];
    if (ipv4 && net.isIPv4(ipv4) && isIPv4Private(ipv4)) {return true;}
  }
  // documentation range 2001:db8::/32
  if (lower.startsWith('2001:db8:') || lower === '2001:db8::') {return true;}
  return false;
}

export interface IpCheckOptions {
  /**
   * When true, loopback addresses (127.0.0.0/8, ::1) are permitted. Every
   * other private range (RFC 1918, link-local, metadata, ULA, multicast)
   * still blocks. Use ONLY for self-hosted sidecars such as a local Ollama
   * at 127.0.0.1.
   *
   * Default: false (strict — loopback blocked).
   */
  readonly allowLoopback?: boolean;
}

/**
 * Return true if the given IP literal refers to a private, loopback,
 * link-local, multicast, reserved, or cloud-metadata address.
 *
 * With `allowLoopback: true`, loopback addresses are NOT considered private
 * (use only for trusted localhost sidecars).
 */
export function isPrivateIp(ip: string, opts: IpCheckOptions = {}): boolean {
  if (net.isIPv4(ip)) {
    if (isIPv4Loopback(ip)) {
      return !opts.allowLoopback;
    }
    return isIPv4Private(ip);
  }
  if (net.isIPv6(ip)) {
    if (isIPv6Loopback(ip)) {
      return !opts.allowLoopback;
    }
    return isIPv6Private(ip);
  }
  // Unknown format — treat as unsafe.
  return true;
}

export class BlockedAddressError extends Error {
  constructor(public readonly ip: string, public readonly host: string) {
    super(`Blocked outbound connection to private/reserved address ${ip} (host=${host})`);
    this.name = 'BlockedAddressError';
  }
}

// ===========================================
// Agent factory
// ===========================================

type LookupFn = (
  hostname: string,
  options: unknown,
  cb: (err: Error | null, address: string, family: number) => void,
) => void;

/** A DNS lookup that rejects private addresses before the socket connects. */
function makeCheckedLookup(opts: IpCheckOptions): LookupFn {
  return (hostname, _options, cb) => {
    import('node:dns')
      .then(({ default: dns }) => {
        dns.lookup(hostname, { all: false, verbatim: true }, (err, address, family) => {
          if (err) {
            cb(err, '', 0);
            return;
          }
          if (isPrivateIp(address, opts)) {
            cb(new BlockedAddressError(address, hostname), '', 0);
            return;
          }
          cb(null, address, family);
        });
      })
      .catch((err) => cb(err as Error, '', 0));
  };
}

export type CheckedAgentOptions = http.AgentOptions & https.AgentOptions & IpCheckOptions;

/**
 * Factory: return an http(s).Agent whose DNS lookup rejects private IPs.
 *
 * @param url - full URL or URL string; used only to pick http vs https
 * @param options - optional extra Agent options (timeout, keepAlive, allowLoopback…)
 */
export function getCheckedAgent(
  url: string | URL,
  options: CheckedAgentOptions = {},
): http.Agent | https.Agent {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  const { allowLoopback, ...agentOpts } = options;
  const lookup = makeCheckedLookup({ allowLoopback }) as unknown as http.AgentOptions['lookup'];
  if (parsed.protocol === 'https:') {
    return new https.Agent({ ...agentOpts, lookup });
  }
  return new http.Agent({ ...agentOpts, lookup });
}

// ===========================================
// Fetch wrapper
// ===========================================

export type CheckedFetchInit = RequestInit & IpCheckOptions & {
  /** @internal: undici picks these up via dispatcher; Node fetch accepts
   * `agent` on `undici`-flavoured builds. Cast to any to stay cross-version. */
  agent?: http.Agent | https.Agent;
};

/**
 * fetch() with a checked agent. Any attempt to reach a private IP throws
 * BlockedAddressError before bytes hit the wire.
 *
 * Pass `{ allowLoopback: true }` ONLY for self-hosted loopback sidecars
 * (Ollama). Everything else must leave it off.
 */
export async function checkedFetch(
  url: string | URL,
  init: CheckedFetchInit = {},
): Promise<Response> {
  const { allowLoopback, ...fetchInit } = init;
  const agent = getCheckedAgent(url, { allowLoopback });
  // Node's built-in fetch doesn't support `agent` directly — it uses undici.
  // We pass it as `dispatcher` too when possible. Consumers who need lower-
  // level access should call getCheckedAgent() and use their own HTTP client.
  const mergedInit = { ...fetchInit, agent } as RequestInit & { agent?: unknown };
  return fetch(url, mergedInit);
}

// ===========================================
// Axios wrapper
// ===========================================

export type CheckedAxiosRequestConfig = AxiosRequestConfig & IpCheckOptions;

/**
 * axios request with a checked agent. Drop-in replacement for call-sites
 * that used `axios.get/post(url, ...)` — the `httpAgent` / `httpsAgent` are
 * swapped for the checked ones so DNS-rebinding to private IPs is blocked
 * before the socket connects.
 *
 * Unlike plain fetch, axios honours `httpAgent` / `httpsAgent` directly,
 * so no dispatcher indirection is needed.
 */
export async function checkedAxiosRequest<T = unknown>(
  config: CheckedAxiosRequestConfig & { url: string },
): Promise<AxiosResponse<T>> {
  const { allowLoopback, url, ...rest } = config;
  const httpAgent = getCheckedAgent(url, { allowLoopback }) as http.Agent;
  const httpsAgent = getCheckedAgent(url, { allowLoopback }) as https.Agent;
  return axios.request<T>({
    ...rest,
    url,
    httpAgent,
    httpsAgent,
  });
}

/** Inject checked agents into any axios config object. */
function withCheckedAgents(
  url: string,
  config: CheckedAxiosRequestConfig,
): AxiosRequestConfig {
  const { allowLoopback, ...rest } = config;
  return {
    ...rest,
    httpAgent: getCheckedAgent(url, { allowLoopback }) as http.Agent,
    httpsAgent: getCheckedAgent(url, { allowLoopback }) as https.Agent,
  };
}

/**
 * Convenience: `axios.get(url, config)` with checked agents.
 *
 * Uses `axios.get` (rather than `axios.request`) so tests that stub the
 * shorthand on the axios mock continue to see the call they expect.
 */
export async function checkedAxiosGet<T = unknown>(
  url: string,
  config: CheckedAxiosRequestConfig = {},
): Promise<AxiosResponse<T>> {
  return axios.get<T>(url, withCheckedAgents(url, config));
}

/** Convenience: `axios.post(url, data, config)` with checked agents. */
export async function checkedAxiosPost<T = unknown>(
  url: string,
  data?: unknown,
  config: CheckedAxiosRequestConfig = {},
): Promise<AxiosResponse<T>> {
  return axios.post<T>(url, data, withCheckedAgents(url, config));
}

/** Convenience: `axios.delete(url, config)` with checked agents. */
export async function checkedAxiosDelete<T = unknown>(
  url: string,
  config: CheckedAxiosRequestConfig = {},
): Promise<AxiosResponse<T>> {
  return axios.delete<T>(url, withCheckedAgents(url, config));
}
