/**
 * Tests for scripts/security/smoke-rate-limits.ts (the `hammer` primitive).
 * Sprint 1.4, Security Week 4.
 */

import { hammer } from '../../../../../scripts/security/smoke-rate-limits';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchWithStatuses(seq: number[]) {
  let i = 0;
  global.fetch = jest.fn(async () => {
    const status = seq[Math.min(i, seq.length - 1)];
    i++;
    return {
      status,
      headers: new Map(
        status === 429
          ? [
              ['retry-after', '1'],
              ['x-ratelimit-limit', '100'],
              ['x-ratelimit-remaining', '0'],
              ['x-ratelimit-reset', '60'],
            ]
          : []
      ) as any,
    } as any;
  }) as any;
}

describe('smoke-rate-limits hammer()', () => {
  it('records all 200s when no rate limiting', async () => {
    mockFetchWithStatuses([200, 200, 200]);
    const result = await hammer('http://localhost/test', 3, 1000);
    expect(result.statusCounts[200]).toBe(3);
    expect(result.sawRateLimit).toBe(false);
    expect(result.firstRateLimitedAt).toBeNull();
  });

  it('captures the first 429 and its rate-limit headers', async () => {
    mockFetchWithStatuses([200, 200, 429, 429, 429]);
    const result = await hammer('http://localhost/test', 5, 1000);
    expect(result.sawRateLimit).toBe(true);
    expect(result.firstRateLimitedAt).toBe(3);
    expect(result.statusCounts[200]).toBe(2);
    expect(result.statusCounts[429]).toBe(3);
    expect(result.rateLimitHeaders).not.toBeNull();
    expect(result.rateLimitHeaders!['retry-after']).toBe('1');
  });

  it('aggregates mixed response codes', async () => {
    mockFetchWithStatuses([200, 500, 429, 200]);
    const result = await hammer('http://localhost/test', 4, 1000);
    expect(result.statusCounts[200]).toBe(2);
    expect(result.statusCounts[500]).toBe(1);
    expect(result.statusCounts[429]).toBe(1);
    expect(result.sawRateLimit).toBe(true);
  });

  it('treats fetch errors gracefully (no throw)', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as any;
    const result = await hammer('http://localhost/test', 2, 1000);
    expect(result.sawRateLimit).toBe(false);
    // error bucket
    expect(result.statusCounts[-2]).toBe(2);
  });

  it('records elapsedMs as non-negative', async () => {
    mockFetchWithStatuses([200]);
    const result = await hammer('http://localhost/test', 1, 1000);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
