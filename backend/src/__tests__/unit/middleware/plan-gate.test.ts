/**
 * Tests for plan-gate middleware
 *
 * Fast-path: plan claim already present in JWT token (synchronous).
 * DB-lookup path: no plan claim → live getUserPlan() call (async).
 */

import type { Request, Response, NextFunction } from 'express';
import { requirePlan } from '../../../middleware/plan-gate';

// Mock billing service for DB-lookup tests
const mockGetUserPlan = jest.fn();
jest.mock('../../../services/billing', () => ({
  getUserPlan: (...args: unknown[]) => mockGetUserPlan(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function makeReq(plan?: string): Partial<Request> {
  return {
    jwtUser: plan ? { id: 'user-1', plan } as any : undefined,
  };
}

function makeRes(): { res: Partial<Response>; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Partial<Response>;
  // status().json() chaining: make status return the res so json is callable
  status.mockImplementation(() => ({ json }));
  return { res, json, status };
}

describe('requirePlan middleware', () => {
  it('blocks a free user from a pro route', () => {
    const middleware = requirePlan('pro');
    const req = makeReq('free');
    const { res, status, json } = makeRes();
    const next = jest.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        requiredPlan: 'pro',
        currentPlan: 'free',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks a free user (no plan claim) from a pro route', () => {
    const middleware = requirePlan('pro');
    const req = makeReq(undefined);
    const { res, status } = makeRes();
    const next = jest.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a pro user through a pro route', () => {
    const middleware = requirePlan('pro');
    const req = makeReq('pro');
    const { res, status } = makeRes();
    const next = jest.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows an enterprise user through a pro route', () => {
    const middleware = requirePlan('pro');
    const req = makeReq('enterprise');
    const { res, status } = makeRes();
    const next = jest.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks a pro user from an enterprise route', () => {
    const middleware = requirePlan('enterprise');
    const req = makeReq('pro');
    const { res, status, json } = makeRes();
    const next = jest.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        requiredPlan: 'enterprise',
        currentPlan: 'pro',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a free user through a free route', () => {
    const middleware = requirePlan('free');
    const req = makeReq('free');
    const { res, status } = makeRes();
    const next = jest.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────
// DB-lookup path (no plan in token → live query)
// ─────────────────────────────────────────────

describe('requirePlan middleware — DB lookup path', () => {
  it('allows access when DB returns a sufficient plan', async () => {
    mockGetUserPlan.mockResolvedValue('pro');
    const middleware = requirePlan('pro');
    const req = { jwtUser: { id: 'user-db-1' } } as unknown as Request;
    const { res, status } = makeRes();
    const next = jest.fn();

    await middleware(req, res as Response, next as NextFunction);

    expect(mockGetUserPlan).toHaveBeenCalledWith('user-db-1');
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks access when DB returns an insufficient plan', async () => {
    mockGetUserPlan.mockResolvedValue('free');
    const middleware = requirePlan('pro');
    const req = { jwtUser: { id: 'user-db-2' } } as unknown as Request;
    const { res, status, json } = makeRes();
    const next = jest.fn();

    await middleware(req, res as Response, next as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        requiredPlan: 'pro',
        currentPlan: 'free',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('caches the fetched plan on jwtUser to avoid repeat DB queries', async () => {
    mockGetUserPlan.mockResolvedValue('enterprise');
    const middleware = requirePlan('pro');
    const req = { jwtUser: { id: 'user-cache' } } as unknown as Request;
    const { res } = makeRes();
    const next = jest.fn();

    await middleware(req, res as Response, next as NextFunction);

    expect((req as any).jwtUser.plan).toBe('enterprise');
  });

  it('defaults to free (and blocks) when jwtUser is absent', async () => {
    const middleware = requirePlan('pro');
    const req = {} as Request;
    const { res, status } = makeRes();
    const next = jest.fn();

    await middleware(req, res as Response, next as NextFunction);

    expect(mockGetUserPlan).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
