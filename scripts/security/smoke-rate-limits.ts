/**
 * smoke-rate-limits.ts — Sprint 1.4, Security Week 4
 *
 * Smoke test that hits a running backend with a burst of requests to verify
 * rate limiting is actually wired into the hot path (A04 / A07). Exits non-zero
 * if the burst is NOT eventually 429'd, which would indicate a regression in
 * the rate-limit middleware or the plan-gate.
 *
 * Unlike the unit tests, this script exercises the full HTTP stack including
 * Express middleware, the Redis store (if configured), and the rate-limit
 * headers surfaced to the client.
 *
 * Usage:
 *   BASE_URL=http://localhost:3001 npx tsx scripts/security/smoke-rate-limits.ts
 *   BASE_URL=http://localhost:3001 npx tsx scripts/security/smoke-rate-limits.ts --burst 120
 *   npx tsx scripts/security/smoke-rate-limits.ts --json
 *
 * Config:
 *   BASE_URL       — backend root URL (default: http://localhost:3001)
 *   SMOKE_PATH     — path to hammer (default: /api/health)
 *   SMOKE_BURST    — total requests (default: 120)
 *   SMOKE_TIMEOUT  — per-request timeout ms (default: 3000)
 */

interface Result {
  url: string;
  burst: number;
  statusCounts: Record<number, number>;
  sawRateLimit: boolean;
  firstRateLimitedAt: number | null;
  rateLimitHeaders: Record<string, string> | null;
  elapsedMs: number;
}

async function hammer(url: string, burst: number, timeoutMs: number): Promise<Result> {
  const started = Date.now();
  const statusCounts: Record<number, number> = {};
  let firstRateLimitedAt: number | null = null;
  let rateLimitHeaders: Record<string, string> | null = null;

  for (let i = 0; i < burst; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      if (res.status === 429 && firstRateLimitedAt === null) {
        firstRateLimitedAt = i + 1;
        rateLimitHeaders = {};
        for (const h of [
          'retry-after',
          'x-ratelimit-limit',
          'x-ratelimit-remaining',
          'x-ratelimit-reset',
        ]) {
          const v = res.headers.get(h);
          if (v) rateLimitHeaders[h] = v;
        }
      }
    } catch (err) {
      const label = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'error';
      statusCounts[label === 'timeout' ? -1 : -2] =
        (statusCounts[label === 'timeout' ? -1 : -2] || 0) + 1;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    url,
    burst,
    statusCounts,
    sawRateLimit: firstRateLimitedAt !== null,
    firstRateLimitedAt,
    rateLimitHeaders,
    elapsedMs: Date.now() - started,
  };
}

function parseArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const smokePath = process.env.SMOKE_PATH || parseArg('path', '/api/health');
  const burst = Number(process.env.SMOKE_BURST || parseArg('burst', '120'));
  const timeout = Number(process.env.SMOKE_TIMEOUT || parseArg('timeout', '3000'));
  const url = baseUrl.replace(/\/$/, '') + smokePath;
  const json = process.argv.includes('--json');

  if (!Number.isFinite(burst) || burst < 1 || burst > 10_000) {
    console.error(`[smoke-rate-limits] Invalid burst size: ${burst}`);
    process.exit(2);
  }

  console.log(
    `[smoke-rate-limits] Hammering ${url} with ${burst} serial requests (timeout ${timeout}ms)...`
  );
  const result = await hammer(url, burst, timeout);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[smoke-rate-limits] Results:`);
    console.log(`  Total:      ${burst}`);
    console.log(`  Elapsed:    ${result.elapsedMs}ms`);
    for (const [code, count] of Object.entries(result.statusCounts)) {
      console.log(`  HTTP ${code}:   ${count}`);
    }
    if (result.sawRateLimit) {
      console.log(
        `  ✅ Rate limit kicked in at request #${result.firstRateLimitedAt}`
      );
      if (result.rateLimitHeaders) {
        console.log(`  Headers observed: ${JSON.stringify(result.rateLimitHeaders)}`);
      }
    } else {
      console.error(
        `  ❌ Burst of ${burst} completed without a single 429. Rate limiting may be disabled or misconfigured.`
      );
    }
  }

  process.exit(result.sawRateLimit ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[smoke-rate-limits] Fatal error:', err);
    process.exit(2);
  });
}

export { hammer };
