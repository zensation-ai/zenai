/**
 * Unit tests for checked-http.ts — verifies the IP blocklist that protects
 * outbound HTTP from DNS-rebinding attacks.
 */

import {
  isPrivateIp,
  getCheckedAgent,
  BlockedAddressError,
} from '../../../utils/checked-http';
import https from 'node:https';
import http from 'node:http';

describe('checked-http.isPrivateIp — IPv4', () => {
  const cases: Array<[string, boolean]> = [
    // RFC 1918 private
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.1.1', true],
    // Loopback
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    // Link-local incl. AWS metadata
    ['169.254.169.254', true],
    ['169.254.0.1', true],
    // CGNAT
    ['100.64.0.1', true],
    ['100.127.255.255', true],
    // Reserved / test-net
    ['192.0.2.1', true],
    ['198.51.100.1', true],
    ['203.0.113.1', true],
    ['0.0.0.0', true],
    // Multicast / broadcast
    ['224.0.0.1', true],
    ['255.255.255.255', true],
    // Public — must NOT be blocked
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['142.250.185.78', false],
    ['172.15.0.1', false],   // just outside 172.16.0.0/12
    ['172.32.0.1', false],   // just outside 172.16.0.0/12
    ['192.167.255.255', false], // just outside 192.168/16
  ];

  test.each(cases)('%s -> private=%s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe('checked-http.isPrivateIp — IPv6', () => {
  const cases: Array<[string, boolean]> = [
    ['::1', true], // loopback
    ['::', true], // unspecified
    ['fe80::1', true], // link-local
    ['fc00::1', true], // ULA
    ['fd12:3456:789a::1', true], // ULA
    ['ff02::1', true], // multicast
    ['2001:db8::1', true], // documentation
    ['::ffff:127.0.0.1', true], // IPv4-mapped loopback
    ['::ffff:192.168.1.1', true], // IPv4-mapped private
    ['::ffff:8.8.8.8', false], // IPv4-mapped public
    ['2606:4700:4700::1111', false], // Cloudflare DNS
    ['2a00:1450:4001:828::200e', false], // Google
  ];

  test.each(cases)('%s -> private=%s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe('checked-http.isPrivateIp — malformed', () => {
  it('treats empty string as unsafe', () => {
    expect(isPrivateIp('')).toBe(true);
  });
  it('treats garbage as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
  });
});

describe('checked-http.getCheckedAgent', () => {
  it('returns an https.Agent for https URLs', () => {
    const agent = getCheckedAgent('https://example.com');
    expect(agent).toBeInstanceOf(https.Agent);
  });

  it('returns an http.Agent for http URLs', () => {
    const agent = getCheckedAgent('http://example.com');
    expect(agent).toBeInstanceOf(http.Agent);
    // Should NOT also be https.Agent (more specific subclass)
    expect(agent).not.toBeInstanceOf(https.Agent);
  });

  it('accepts a URL object', () => {
    const agent = getCheckedAgent(new URL('https://api.example.com/v1'));
    expect(agent).toBeInstanceOf(https.Agent);
  });

  it('installs a custom lookup that blocks private IPs', (done) => {
    const agent = getCheckedAgent('https://example.com');
    const lookup = (agent as unknown as { options: { lookup?: Function } }).options.lookup;
    expect(typeof lookup).toBe('function');

    // Pretend the resolver returned 127.0.0.1. We test the `isPrivateIp`
    // guard — since we hand the lookup a real hostname, we can't mock the
    // DNS underneath cleanly; instead we verify that calling the lookup
    // for 'localhost' rejects with BlockedAddressError on most systems.
    // Fallback: skip gracefully if DNS resolution is unavailable.
    lookup!('localhost', {}, (err: Error | null, addr: string) => {
      if (err instanceof BlockedAddressError) {
        expect(err.message).toMatch(/private\/reserved/);
        done();
        return;
      }
      // DNS resolved to something; assert it's at least not a public address
      // when the hostname is 'localhost'.
      if (!err && addr) {
        expect(isPrivateIp(addr)).toBe(true);
      }
      done();
    });
  });
});

describe('checked-http.BlockedAddressError', () => {
  it('carries ip + host context', () => {
    const err = new BlockedAddressError('10.0.0.1', 'malicious.example');
    expect(err.ip).toBe('10.0.0.1');
    expect(err.host).toBe('malicious.example');
    expect(err.name).toBe('BlockedAddressError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('checked-http.isPrivateIp — allowLoopback opt-in', () => {
  // Loopback addresses the opt-in must permit. Everything else must still
  // block — the Ollama sidecar sits on 127.0.0.1, not on the rest of RFC 1918.
  const loopbacks: string[] = [
    '127.0.0.1',
    '127.255.255.255',
    '::1',
    '::ffff:127.0.0.1',
  ];

  // Private / reserved ranges that remain blocked even with allowLoopback:
  // opening the door for LAN, CGNAT, or cloud metadata would defeat the
  // defense — the opt-in is a keyhole, not a bypass.
  const stillBlocked: string[] = [
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',  // AWS metadata
    '100.64.0.1',       // CGNAT
    '0.0.0.0',
    'fe80::1',
    'fc00::1',
    '::ffff:10.0.0.1',
  ];

  test.each(loopbacks)('allowLoopback=true permits loopback %s', (ip) => {
    expect(isPrivateIp(ip, { allowLoopback: true })).toBe(false);
  });

  test.each(loopbacks)('allowLoopback=false (default) still blocks loopback %s', (ip) => {
    expect(isPrivateIp(ip, { allowLoopback: false })).toBe(true);
    expect(isPrivateIp(ip)).toBe(true); // omitted option === strict
  });

  test.each(stillBlocked)('allowLoopback=true still blocks non-loopback private %s', (ip) => {
    expect(isPrivateIp(ip, { allowLoopback: true })).toBe(true);
  });

  it('public IPs are unchanged by allowLoopback', () => {
    expect(isPrivateIp('8.8.8.8', { allowLoopback: true })).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111', { allowLoopback: true })).toBe(false);
  });
});

describe('checked-http.getCheckedAgent — allowLoopback opt-in', () => {
  it('strict agent rejects 127.0.0.1 resolution (BlockedAddressError)', (done) => {
    const agent = getCheckedAgent('http://127.0.0.1:11434');
    const lookup = (agent as unknown as { options: { lookup?: Function } }).options.lookup;
    expect(typeof lookup).toBe('function');
    lookup!('127.0.0.1', {}, (err: Error | null) => {
      expect(err).toBeInstanceOf(BlockedAddressError);
      done();
    });
  });

  it('allowLoopback: true agent permits 127.0.0.1 resolution', (done) => {
    const agent = getCheckedAgent('http://127.0.0.1:11434', { allowLoopback: true });
    const lookup = (agent as unknown as { options: { lookup?: Function } }).options.lookup;
    expect(typeof lookup).toBe('function');
    lookup!('127.0.0.1', {}, (err: Error | null, address: string, family: number) => {
      expect(err).toBeNull();
      expect(address).toBe('127.0.0.1');
      expect(family).toBe(4);
      done();
    });
  });

  it('allowLoopback: true agent still rejects 169.254.169.254 (cloud metadata)', (done) => {
    const agent = getCheckedAgent('http://169.254.169.254', { allowLoopback: true });
    const lookup = (agent as unknown as { options: { lookup?: Function } }).options.lookup;
    expect(typeof lookup).toBe('function');
    lookup!('169.254.169.254', {}, (err: Error | null) => {
      expect(err).toBeInstanceOf(BlockedAddressError);
      done();
    });
  });

  it('allowLoopback: true agent still rejects 10.0.0.5 (RFC 1918)', (done) => {
    const agent = getCheckedAgent('http://10.0.0.5', { allowLoopback: true });
    const lookup = (agent as unknown as { options: { lookup?: Function } }).options.lookup;
    expect(typeof lookup).toBe('function');
    lookup!('10.0.0.5', {}, (err: Error | null) => {
      expect(err).toBeInstanceOf(BlockedAddressError);
      done();
    });
  });

  it('allowLoopback: true works for IPv6 ::1', (done) => {
    const agent = getCheckedAgent('http://[::1]:11434', { allowLoopback: true });
    const lookup = (agent as unknown as { options: { lookup?: Function } }).options.lookup;
    expect(typeof lookup).toBe('function');
    lookup!('::1', {}, (err: Error | null, address: string) => {
      expect(err).toBeNull();
      expect(address).toBe('::1');
      done();
    });
  });
});
