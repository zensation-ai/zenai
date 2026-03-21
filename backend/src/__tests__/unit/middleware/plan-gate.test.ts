/**
 * Tests for plan-gate middleware
 */

import type { Request, Response, NextFunction } from 'express';
import { requirePlan } from '../../../middleware/plan-gate';

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
