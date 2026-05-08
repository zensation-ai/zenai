/**
 * Sprint 1.9: JWT Auth Middleware — plan propagation tests
 *
 * Verifies that `req.jwtUser.plan` is populated from the JWT payload for
 * non-demo tokens (Sprint 1.9 change), while preserving the existing
 * demo-branch behavior.
 */

import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../utils/request-context', () => ({
  setCurrentUserId: jest.fn(),
  setCurrentWorkspaceId: jest.fn(),
  setCurrentIsAdmin: jest.fn(),
}));

// API-key fallback should never be hit by these tests — if it is, fail loudly.
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: Request, res: Response) => {
    res.status(500).json({ error: 'apiKeyAuth should not have been called' });
  }),
  optionalAuth: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

import { jwtAuth, optionalJwtAuth, requireJwt } from '../../../middleware/jwt-auth';

const TEST_SECRET = 'test-jwt-secret-for-jwt-auth-middleware';

function makeReq(token?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    params: {},
  } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('jwtAuth middleware — Sprint 1.9 plan propagation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, JWT_SECRET: TEST_SECRET };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function signToken(payload: Record<string, unknown>, ttl = '15m'): string {
    return jwt.sign(payload, TEST_SECRET, { expiresIn: ttl, algorithm: 'HS256' });
  }

  it('should set req.jwtUser.plan from the JWT payload for regular users', async () => {
    const token = signToken({
      sub: 'usr_1',
      email: 'u@example.com',
      role: 'user',
      plan: 'pro',
    });
    const req = makeReq(token);
    const { res } = makeRes();
    const next = jest.fn();

    await jwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.jwtUser).toBeDefined();
    expect(req.jwtUser?.plan).toBe('pro');
    expect(req.jwtUser?.isDemo).toBeUndefined();
  });

  it('should leave plan undefined for legacy pre-1.9 tokens (no plan field)', async () => {
    const token = signToken({
      sub: 'usr_legacy',
      email: 'legacy@example.com',
      role: 'user',
    });
    const req = makeReq(token);
    const { res } = makeRes();
    const next = jest.fn();

    await jwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.jwtUser).toBeDefined();
    expect(req.jwtUser?.plan).toBeUndefined();
  });

  it('should preserve demo-branch behavior (plan override to pro)', async () => {
    const token = signToken({
      sub: 'demo_1',
      email: 'demo@example.com',
      role: 'user',
      isDemo: true,
      // No plan field — demo should default to 'pro'
    });
    const req = makeReq(token);
    const { res } = makeRes();
    const next = jest.fn();

    await jwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.jwtUser?.isDemo).toBe(true);
    expect(req.jwtUser?.plan).toBe('pro');
  });

  it('should honor an explicit plan on demo tokens', async () => {
    const token = signToken({
      sub: 'demo_2',
      email: 'demo@example.com',
      role: 'user',
      isDemo: true,
      plan: 'enterprise',
    });
    const req = makeReq(token);
    const { res } = makeRes();
    const next = jest.fn();

    await jwtAuth(req, res, next);

    expect(req.jwtUser?.plan).toBe('enterprise');
  });

  it('should propagate plan for business tier', async () => {
    const token = signToken({
      sub: 'usr_biz',
      email: 'biz@example.com',
      role: 'owner',
      plan: 'business',
      orgId: 'org_1',
    });
    const req = makeReq(token);
    const { res } = makeRes();
    const next = jest.fn();

    await jwtAuth(req, res, next);

    expect(req.jwtUser?.plan).toBe('business');
    expect(req.jwtUser?.orgId).toBe('org_1');
  });
});

describe('optionalJwtAuth — Sprint 1.9 plan propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it('should set plan from payload when present', async () => {
    const token = jwt.sign(
      { sub: 'usr_1', email: 'u@example.com', role: 'user', plan: 'personal' },
      TEST_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );
    const req = makeReq(token);
    const { res } = makeRes();
    const next = jest.fn();

    await optionalJwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.jwtUser?.plan).toBe('personal');
  });

  it('should still call next when no auth header is present', async () => {
    const req = makeReq();
    const { res } = makeRes();
    const next = jest.fn();

    await optionalJwtAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.jwtUser).toBeUndefined();
  });
});

describe('requireJwt — Sprint 1.9 plan propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it('should set plan from payload', () => {
    const token = jwt.sign(
      { sub: 'usr_1', email: 'u@example.com', role: 'user', plan: 'pro' },
      TEST_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );
    const req = makeReq(token);
    const { res } = makeRes();
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.jwtUser?.plan).toBe('pro');
  });

  it('should 401 when no Bearer token is present', () => {
    const req = makeReq();
    const { res, status } = makeRes();
    const next = jest.fn();

    requireJwt(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
