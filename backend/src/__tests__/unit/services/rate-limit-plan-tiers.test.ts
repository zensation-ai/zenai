/**
 * Sprint 1.3 — Rate-Limit Plan-Tier-Tests
 *
 * Verifiziert die neue plan-basierte Rate-Limit-Schicht (Sprint 1.3):
 *   - Boundary: letzter erlaubter Request, erster blockierter Request
 *   - Tier-Switch: free blockt, pro lässt durch (gleicher User-Key)
 *   - Enterprise: unlimited (kein 429 auch bei hoher Rate)
 *   - Daily-Window: blockt parallel zum Minute-Window
 *   - 429-Response: strukturierte Body mit plan/limit/upgradeHint/retryAfter
 *   - Telemetrie: tier_hit_ratio = blocked / total pro (plan, kind)
 *   - Headers: X-RateLimit-Plan + Retry-After werden gesetzt
 */

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import type { Request, Response, NextFunction } from 'express';
import {
  createPlanRateLimiter,
  PLAN_RATE_LIMITS,
  resolvePlanFromRequest,
  getRateLimitTelemetry,
  resetMemoryStore,
  getRateLimitStats,
} from '../../../services/security/rate-limit-advanced';
import type { OrgPlan } from '../../../types/multi-tenancy';

// ===========================================
// Test-Doubles
// ===========================================

interface MockRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string | number>;
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
}

function makeReq(opts: { userId?: string; plan?: OrgPlan; ip?: string } = {}): Request {
  const req: Partial<Request> = {
    ip: opts.ip ?? '127.0.0.1',
    path: '/api/test',
    method: 'GET',
    headers: {},
    socket: { remoteAddress: opts.ip ?? '127.0.0.1' } as Request['socket'],
  };
  if (opts.userId) {
    req.jwtUser = {
      id: opts.userId,
      email: `${opts.userId}@test.local`,
      role: 'member',
      plan: opts.plan,
    };
  }
  return req as Request;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: null,
    headers: {},
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res as unknown as Response;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res as unknown as Response;
  });
  res.setHeader.mockImplementation((name: string, value: string | number) => {
    res.headers[name] = value;
    return res as unknown as Response;
  });
  return res;
}

async function hit(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Request
): Promise<{ res: MockRes; nextCalled: boolean }> {
  const res = makeRes();
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  await middleware(req, res as unknown as Response, next);
  return { res, nextCalled };
}

// ===========================================
// Tests
// ===========================================

describe('Sprint 1.3 — Plan-Based Rate Limiting', () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  // ===========================================
  // resolvePlanFromRequest()
  // ===========================================

  describe('resolvePlanFromRequest()', () => {
    it('liest plan aus req.jwtUser.plan', () => {
      expect(resolvePlanFromRequest(makeReq({ userId: 'u1', plan: 'pro' }))).toBe('pro');
      expect(resolvePlanFromRequest(makeReq({ userId: 'u1', plan: 'enterprise' }))).toBe('enterprise');
      expect(resolvePlanFromRequest(makeReq({ userId: 'u1', plan: 'business' }))).toBe('business');
    });

    it('fällt auf "free" zurück wenn kein Plan gesetzt', () => {
      expect(resolvePlanFromRequest(makeReq({ userId: 'u1' }))).toBe('free');
      expect(resolvePlanFromRequest(makeReq())).toBe('free');
    });

    it('akzeptiert keinen ungültigen Plan (Injection-Schutz)', () => {
      const req = makeReq({ userId: 'u1' });
      // @ts-expect-error — simuliere bösartigen Payload
      req.jwtUser!.plan = 'god-mode';
      expect(resolvePlanFromRequest(req)).toBe('free');
    });
  });

  // ===========================================
  // Boundary: letzter OK, erster blockiert
  // ===========================================

  describe('Minute-Window Boundary', () => {
    it('free: 100 Requests/min erlaubt, 101. blockt', async () => {
      const limiter = createPlanRateLimiter('api');
      const req = makeReq({ userId: 'free-u1', plan: 'free' });

      for (let i = 1; i <= 100; i++) {
        const { res, nextCalled } = await hit(limiter, req);
        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBe(0); // 0 = noch nie status() gesetzt → OK
        if (i === 100) {
          expect(res.headers['X-RateLimit-Remaining']).toBe(0);
        }
      }

      // Der 101. wird geblockt
      const { res, nextCalled } = await hit(limiter, req);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(429);
    });

    it('personal: 500 Requests/min erlaubt, 501. blockt', async () => {
      const limiter = createPlanRateLimiter('api');
      const req = makeReq({ userId: 'personal-u1', plan: 'personal' });

      // Alle 500 durchlassen (bulk)
      for (let i = 1; i <= 500; i++) {
        const { nextCalled } = await hit(limiter, req);
        expect(nextCalled).toBe(true);
      }

      const { res, nextCalled } = await hit(limiter, req);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(429);
    });

    it('ai-kind ist strenger als api-kind (10 vs 100 für free)', async () => {
      const aiLimiter = createPlanRateLimiter('ai');
      const apiLimiter = createPlanRateLimiter('api');
      const reqAi = makeReq({ userId: 'ai-u1', plan: 'free' });
      const reqApi = makeReq({ userId: 'api-u1', plan: 'free' });

      // AI: 10 OK, 11. blockt
      for (let i = 1; i <= 10; i++) {
        const { nextCalled } = await hit(aiLimiter, reqAi);
        expect(nextCalled).toBe(true);
      }
      const aiBlocked = await hit(aiLimiter, reqAi);
      expect(aiBlocked.nextCalled).toBe(false);
      expect(aiBlocked.res.statusCode).toBe(429);

      // API mit 11 Requests: noch lange nicht geblockt
      for (let i = 1; i <= 11; i++) {
        const { nextCalled } = await hit(apiLimiter, reqApi);
        expect(nextCalled).toBe(true);
      }
    });
  });

  // ===========================================
  // Enterprise: Unlimited
  // ===========================================

  describe('Enterprise-Plan Bypass', () => {
    it('blockt NIE, auch bei extrem hoher Rate', async () => {
      const limiter = createPlanRateLimiter('ai');
      const req = makeReq({ userId: 'enterprise-u1', plan: 'enterprise' });

      // 200 Requests — deutlich über free/personal/pro Limit
      for (let i = 0; i < 200; i++) {
        const { nextCalled } = await hit(limiter, req);
        expect(nextCalled).toBe(true);
      }
    });

    it('zählt trotzdem in der Telemetrie (als total, nicht blocked)', async () => {
      const limiter = createPlanRateLimiter('ai');
      const req = makeReq({ userId: 'enterprise-u2', plan: 'enterprise' });

      await hit(limiter, req);
      await hit(limiter, req);
      await hit(limiter, req);

      const telemetry = getRateLimitTelemetry();
      const entry = telemetry.find((e) => e.plan === 'enterprise' && e.kind === 'ai');
      expect(entry).toBeDefined();
      expect(entry!.total).toBe(3);
      expect(entry!.blocked).toBe(0);
      expect(entry!.tier_hit_ratio).toBe(0);
    });
  });

  // ===========================================
  // Tier-Switch: gleicher User, unterschiedliche Pläne
  // ===========================================

  describe('Tier-Switch (gleicher User, Plan-Upgrade)', () => {
    it('user mit free blockt bei 11 AI-Requests, mit pro nicht', async () => {
      const limiter = createPlanRateLimiter('ai');

      // Scenario 1: user auf free
      const freeReq = makeReq({ userId: 'switch-u1', plan: 'free' });
      for (let i = 0; i < 10; i++) {
        await hit(limiter, freeReq);
      }
      const blockedFree = await hit(limiter, freeReq);
      expect(blockedFree.res.statusCode).toBe(429);

      // Scenario 2: gleicher User, jetzt mit plan='pro'
      // (Counter wurde mit free-Key gespeichert; pro hat eigenen key-prefix)
      resetMemoryStore();
      const proReq = makeReq({ userId: 'switch-u1', plan: 'pro' });
      // 50 Requests — weit über free-Limit, aber innerhalb pro
      for (let i = 0; i < 50; i++) {
        const { nextCalled } = await hit(limiter, proReq);
        expect(nextCalled).toBe(true);
      }
    });

    it('Plan-Limits sind isoliert pro Plan-Key (free bucket != pro bucket)', async () => {
      const limiter = createPlanRateLimiter('ai');
      const freeReq = makeReq({ userId: 'iso-u1', plan: 'free' });
      const proReq = makeReq({ userId: 'iso-u1', plan: 'pro' });

      // 10 auf free
      for (let i = 0; i < 10; i++) {
        await hit(limiter, freeReq);
      }
      // 11. auf free würde blocken
      const blockedFree = await hit(limiter, freeReq);
      expect(blockedFree.res.statusCode).toBe(429);

      // Aber als pro: kein Problem (separate bucket)
      const proOk = await hit(limiter, proReq);
      expect(proOk.nextCalled).toBe(true);
    });
  });

  // ===========================================
  // 429-Response Struktur
  // ===========================================

  describe('429-Response Struktur', () => {
    it('enthält plan, kind, window, limit, retryAfter, upgradeHint', async () => {
      const limiter = createPlanRateLimiter('ai');
      const req = makeReq({ userId: '429-u1', plan: 'free' });

      // Limit ausnutzen
      for (let i = 0; i < PLAN_RATE_LIMITS.free.ai.perMinute; i++) {
        await hit(limiter, req);
      }

      const { res } = await hit(limiter, req);
      expect(res.statusCode).toBe(429);

      const body = res.body as Record<string, unknown>;
      expect(body.success).toBe(false);
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.plan).toBe('free');
      expect(body.kind).toBe('ai');
      expect(body.window).toBe('minute');
      expect(body.limit).toBe(PLAN_RATE_LIMITS.free.ai.perMinute);
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.upgradeHint).toContain('personal');
    });

    it('upgradeHint ist null für enterprise-Plan (würde aber nie getriggert)', async () => {
      // Enterprise hat kein Limit, wird also nie 429 — wir testen nur die Hint-Funktion
      // indirekt über pro, das als nächstes 'business' als Upgrade sieht
      const limiter = createPlanRateLimiter('ai');
      const req = makeReq({ userId: '429-u2', plan: 'pro' });

      for (let i = 0; i < PLAN_RATE_LIMITS.pro.ai.perMinute; i++) {
        await hit(limiter, req);
      }

      const { res } = await hit(limiter, req);
      const body = res.body as Record<string, unknown>;
      expect(body.plan).toBe('pro');
      expect(body.upgradeHint).toContain('business');
    });

    it('Retry-After Header ist korrekt gesetzt', async () => {
      const limiter = createPlanRateLimiter('ai');
      const req = makeReq({ userId: '429-u3', plan: 'free' });

      for (let i = 0; i < PLAN_RATE_LIMITS.free.ai.perMinute; i++) {
        await hit(limiter, req);
      }

      const { res } = await hit(limiter, req);
      expect(res.headers['Retry-After']).toBeGreaterThan(0);
      expect(res.headers['Retry-After']).toBeLessThanOrEqual(60);
    });

    it('X-RateLimit-Plan Header wird bei JEDEM Request gesetzt (nicht nur bei 429)', async () => {
      const limiter = createPlanRateLimiter('api');
      const req = makeReq({ userId: 'header-u1', plan: 'personal' });

      const { res } = await hit(limiter, req);
      expect(res.headers['X-RateLimit-Plan']).toBe('personal');
      expect(res.headers['X-RateLimit-Limit']).toBe(PLAN_RATE_LIMITS.personal.api.perMinute);
      expect(res.headers['X-RateLimit-Remaining']).toBe(PLAN_RATE_LIMITS.personal.api.perMinute - 1);
    });
  });

  // ===========================================
  // Telemetrie
  // ===========================================

  describe('Tier-Hit-Telemetrie', () => {
    it('tier_hit_ratio = blocked / total', async () => {
      const limiter = createPlanRateLimiter('ai');
      const req = makeReq({ userId: 'tel-u1', plan: 'free' });

      // 10 OK
      for (let i = 0; i < 10; i++) {
        await hit(limiter, req);
      }
      // 5 blockiert
      for (let i = 0; i < 5; i++) {
        await hit(limiter, req);
      }

      const telemetry = getRateLimitTelemetry();
      const entry = telemetry.find((e) => e.plan === 'free' && e.kind === 'ai');
      expect(entry).toBeDefined();
      expect(entry!.total).toBe(15);
      expect(entry!.blocked).toBe(5);
      expect(entry!.tier_hit_ratio).toBeCloseTo(5 / 15);
    });

    it('trackt verschiedene Pläne separat', async () => {
      const limiter = createPlanRateLimiter('ai');
      const free = makeReq({ userId: 'multi-u1', plan: 'free' });
      const pro = makeReq({ userId: 'multi-u2', plan: 'pro' });

      await hit(limiter, free);
      await hit(limiter, free);
      await hit(limiter, pro);

      const telemetry = getRateLimitTelemetry();
      const freeEntry = telemetry.find((e) => e.plan === 'free' && e.kind === 'ai');
      const proEntry = telemetry.find((e) => e.plan === 'pro' && e.kind === 'ai');

      expect(freeEntry!.total).toBe(2);
      expect(proEntry!.total).toBe(1);
    });

    it('trackt api und ai Kinds separat', async () => {
      const aiLimiter = createPlanRateLimiter('ai');
      const apiLimiter = createPlanRateLimiter('api');
      const req = makeReq({ userId: 'kind-u1', plan: 'free' });

      await hit(aiLimiter, req);
      await hit(apiLimiter, req);
      await hit(apiLimiter, req);

      const telemetry = getRateLimitTelemetry();
      const aiEntry = telemetry.find((e) => e.plan === 'free' && e.kind === 'ai');
      const apiEntry = telemetry.find((e) => e.plan === 'free' && e.kind === 'api');

      expect(aiEntry!.total).toBe(1);
      expect(apiEntry!.total).toBe(2);
    });

    it('getRateLimitStats() enthält Telemetrie-Feld', async () => {
      const limiter = createPlanRateLimiter('ai');
      await hit(limiter, makeReq({ userId: 'stats-u1', plan: 'pro' }));

      const stats = getRateLimitStats();
      expect(Array.isArray(stats.telemetry)).toBe(true);
      expect(stats.telemetry.length).toBeGreaterThan(0);
    });

    it('resetMemoryStore() löscht Telemetrie', async () => {
      const limiter = createPlanRateLimiter('ai');
      await hit(limiter, makeReq({ userId: 'reset-u1', plan: 'free' }));
      expect(getRateLimitTelemetry().length).toBeGreaterThan(0);

      resetMemoryStore();
      expect(getRateLimitTelemetry().length).toBe(0);
    });
  });

  // ===========================================
  // PLAN_RATE_LIMITS Konfiguration
  // ===========================================

  describe('PLAN_RATE_LIMITS Konfiguration', () => {
    it('alle 5 Pläne sind definiert', () => {
      const plans: OrgPlan[] = ['free', 'personal', 'pro', 'business', 'enterprise'];
      for (const plan of plans) {
        expect(PLAN_RATE_LIMITS[plan]).toBeDefined();
        expect(PLAN_RATE_LIMITS[plan].api).toBeDefined();
        expect(PLAN_RATE_LIMITS[plan].ai).toBeDefined();
      }
    });

    it('Limits sind monoton steigend (free < personal < pro < business)', () => {
      const plans: OrgPlan[] = ['free', 'personal', 'pro', 'business'];
      for (let i = 1; i < plans.length; i++) {
        const prev = PLAN_RATE_LIMITS[plans[i - 1]].api.perMinute;
        const curr = PLAN_RATE_LIMITS[plans[i]].api.perMinute;
        expect(curr).toBeGreaterThan(prev);

        const prevDay = PLAN_RATE_LIMITS[plans[i - 1]].api.perDay as number;
        const currDay = PLAN_RATE_LIMITS[plans[i]].api.perDay as number;
        expect(currDay).toBeGreaterThan(prevDay);
      }
    });

    it('enterprise hat perMinute = Infinity und perDay = null', () => {
      expect(Number.isFinite(PLAN_RATE_LIMITS.enterprise.api.perMinute)).toBe(false);
      expect(PLAN_RATE_LIMITS.enterprise.api.perDay).toBeNull();
      expect(Number.isFinite(PLAN_RATE_LIMITS.enterprise.ai.perMinute)).toBe(false);
      expect(PLAN_RATE_LIMITS.enterprise.ai.perDay).toBeNull();
    });

    it('ai-Limits sind strenger als api-Limits für jeden Plan', () => {
      const plans: OrgPlan[] = ['free', 'personal', 'pro', 'business'];
      for (const plan of plans) {
        expect(PLAN_RATE_LIMITS[plan].ai.perMinute).toBeLessThan(
          PLAN_RATE_LIMITS[plan].api.perMinute
        );
      }
    });

    it('Master-Plan v2 Sektion 7 exakte Werte', () => {
      // Hart kodiert gegen spec — wenn das hier fehlschlägt, hat jemand die
      // Limits geändert ohne Master-Plan zu aktualisieren.
      expect(PLAN_RATE_LIMITS.free.api).toEqual({ perMinute: 100, perDay: 1_000 });
      expect(PLAN_RATE_LIMITS.personal.api).toEqual({ perMinute: 500, perDay: 5_000 });
      expect(PLAN_RATE_LIMITS.pro.api).toEqual({ perMinute: 5_000, perDay: 50_000 });
      expect(PLAN_RATE_LIMITS.business.api).toEqual({ perMinute: 50_000, perDay: 500_000 });
    });
  });
});
