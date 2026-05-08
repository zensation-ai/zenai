/**
 * Auth-Backfill Smoke Tests — Sprint 1.5 Item 4
 *
 * Verifies that the 12 legacy route modules which Sprint 1.5 Item 4 wired up
 * reject unauthenticated requests with HTTP 401. These tests mount each
 * router into a bare Express app — no module-level mocks for `auth` — so the
 * real `apiKeyAuth` middleware runs end-to-end and returns 401 *before* any
 * DB lookup (the short-circuit for missing `Authorization`/`x-api-key`).
 *
 * Complement: `scripts/security/check-auth-boundaries.ts --strict` in CI
 * statically enforces that no route slips through without auth.
 *
 * Mocking policy:
 *   - We mock `utils/database` only so the in-memory rate-limiter fallback
 *     inside `apiKeyAuth` doesn't try to reach a real Postgres pool.
 *   - Everything else (router, middleware, errorHandler) runs real.
 */
import express, { Express } from 'express';
import request from 'supertest';

jest.mock('../../utils/database', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// apiKeyAuth logs a warning/info on every rejection; silence that.
beforeEach(() => {
  jest.clearAllMocks();
});

// Helper: mount router into a fresh app.
function buildApp(mount: (app: Express) => void): Express {
  const app = express();
  app.use(express.json());
  mount(app);
  return app;
}

// ─── Per-module smoke tests ─────────────────────────────────────────────────

describe('Sprint 1.5 Item 4 — auth-backfill smoke tests', () => {
  it('curiosity: GET /api/operations/curiosity/gaps → 401 without auth', async () => {
    const router = require('../../routes/curiosity').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/curiosity/gaps');
    expect(res.status).toBe(401);
  });

  it('predictions: GET /api/operations/predictions/history → 401', async () => {
    const router = require('../../routes/predictions').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/predictions/history');
    expect(res.status).toBe(401);
  });

  it('metacognition: GET /api/operations/metacognition/states → 401', async () => {
    const router = require('../../routes/metacognition').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/metacognition/states');
    expect(res.status).toBe(401);
  });

  it('pma-memory-routes: GET /api/operations/memory/neuromodulators → 401', async () => {
    const router = require('../../routes/pma-memory-routes').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/memory/neuromodulators');
    expect(res.status).toBe(401);
  });

  it('pma-metacognition-routes: GET /api/operations/metacognition/bias-report → 401', async () => {
    const router = require('../../routes/pma-metacognition-routes').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/metacognition/bias-report');
    expect(res.status).toBe(401);
  });

  it('feedback-adaptive: GET /api/operations/feedback/summary → 401', async () => {
    const router = require('../../routes/feedback-adaptive').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/feedback/summary');
    expect(res.status).toBe(401);
  });

  it('fsrs-review: GET /api/operations/memory/review-queue → 401', async () => {
    const router = require('../../routes/fsrs-review').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/memory/review-queue');
    expect(res.status).toBe(401);
  });

  it('self-improvement: GET /api/operations/self-improvement/opportunities → 401', async () => {
    const router = require('../../routes/self-improvement').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/self-improvement/opportunities');
    expect(res.status).toBe(401);
  });

  it('slack: GET /api/slack/workspaces → 401 (requireJwt gate)', async () => {
    const { createSlackRouter } = require('../../routes/slack');
    const app = buildApp((a) => a.use('/api/slack', createSlackRouter()));
    const res = await request(app).get('/api/slack/workspaces');
    expect(res.status).toBe(401);
  });

  it('social-oauth: GET /api/social/oauth/twitter/start → 401 (initiate requires auth)', async () => {
    const router = require('../../routes/social-oauth').default;
    const app = buildApp((a) => a.use('/api/social/oauth', router));
    const res = await request(app).get('/api/social/oauth/twitter/start');
    expect(res.status).toBe(401);
  });

  it('social: GET /api/operations/social/posts → 401', async () => {
    const router = require('../../routes/social').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/social/posts');
    expect(res.status).toBe(401);
  });

  it('streak: GET /api/operations/streak → 401', async () => {
    const router = require('../../routes/streak').default;
    const app = buildApp((a) => a.use('/api', router));
    const res = await request(app).get('/api/operations/streak');
    expect(res.status).toBe(401);
  });

  // ─── Public boundary cross-check ─────────────────────────────────────────
  // OAuth callbacks stay public by design (provider can't send API key).
  // They're not in scope for the 401 contract — just verify they don't 401.

  it('social-oauth callback is NOT behind apiKeyAuth (would break provider redirect)', async () => {
    const router = require('../../routes/social-oauth').default;
    const app = buildApp((a) => a.use('/api/social/oauth', router));
    // Missing query params will land in handler and branch — the key
    // assertion is that we never get a 401 here.
    const res = await request(app).get('/api/social/oauth/twitter/callback');
    expect(res.status).not.toBe(401);
  });
});

// ─── Positive control: static-analysis CI guard ──────────────────────────────

describe('Sprint 1.5 Item 4 — static-analysis contract', () => {
  it('check-auth-boundaries reports zero unprotected routes (strict mode)', () => {
    const path = require('node:path');
    const { runAudit } = require('../../../../scripts/security/check-auth-boundaries');
    const routesDir = path.resolve(__dirname, '../../../src/routes');
    const violations = runAudit(routesDir);
    expect(violations).toEqual([]);
  });
});
