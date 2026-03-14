/**
 * Phase 66: Request Context (AsyncLocalStorage) Tests
 *
 * Tests per-request context isolation via AsyncLocalStorage covering:
 * - getCurrentUserId() outside/inside context
 * - requestContextMiddleware creates store
 * - setCurrentUserId() / getCurrentUserId() round-trip
 * - runAsUser() execution
 * - nested context isolation
 * - concurrent request isolation
 * - request ID from headers
 */

import {
  requestContext,
  requestContextMiddleware,
  setCurrentUserId,
  getCurrentUserId,
  getCurrentRequestId,
  runAsUser,
} from '../../../utils/request-context';
import { Request, Response, NextFunction } from 'express';

// Helper to create a mock Express request
function mockReq(headers: Record<string, string> = {}): Partial<Request> {
  return {
    headers,
  };
}

function mockRes(): Partial<Response> {
  return {};
}

describe('Request Context (AsyncLocalStorage)', () => {
  describe('getCurrentUserId() outside of context', () => {
    it('should return undefined when called outside any request context', () => {
      expect(getCurrentUserId()).toBeUndefined();
    });
  });

  describe('getCurrentRequestId() outside of context', () => {
    it('should return undefined when called outside any request context', () => {
      expect(getCurrentRequestId()).toBeUndefined();
    });
  });

  describe('requestContextMiddleware', () => {
    it('should call next()', (done) => {
      const req = mockReq() as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        done();
      };
      requestContextMiddleware(req, res, next);
    });

    it('should create a store that is accessible inside next()', (done) => {
      const req = mockReq() as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        const store = requestContext.getStore();
        expect(store).toBeDefined();
        done();
      };
      requestContextMiddleware(req, res, next);
    });

    it('should set requestId from x-request-id header', (done) => {
      const req = mockReq({ 'x-request-id': 'req-abc-123' }) as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        expect(getCurrentRequestId()).toBe('req-abc-123');
        done();
      };
      requestContextMiddleware(req, res, next);
    });

    it('should leave requestId undefined when header is missing', (done) => {
      const req = mockReq() as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        expect(getCurrentRequestId()).toBeUndefined();
        done();
      };
      requestContextMiddleware(req, res, next);
    });

    it('should start with userId undefined', (done) => {
      const req = mockReq() as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        expect(getCurrentUserId()).toBeUndefined();
        done();
      };
      requestContextMiddleware(req, res, next);
    });
  });

  describe('setCurrentUserId() and getCurrentUserId()', () => {
    it('should store and retrieve userId within middleware context', (done) => {
      const req = mockReq() as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        setCurrentUserId('user-uuid-123');
        expect(getCurrentUserId()).toBe('user-uuid-123');
        done();
      };
      requestContextMiddleware(req, res, next);
    });

    it('should be a no-op when called outside of context', () => {
      // setCurrentUserId should not throw when there is no store
      expect(() => setCurrentUserId('orphan-user')).not.toThrow();
      // userId should still be undefined outside context
      expect(getCurrentUserId()).toBeUndefined();
    });

    it('should allow overwriting userId within the same context', (done) => {
      const req = mockReq() as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        setCurrentUserId('first-user');
        expect(getCurrentUserId()).toBe('first-user');
        setCurrentUserId('second-user');
        expect(getCurrentUserId()).toBe('second-user');
        done();
      };
      requestContextMiddleware(req, res, next);
    });
  });

  describe('runAsUser()', () => {
    it('should execute function with the specified userId', () => {
      const result = runAsUser('run-as-user-id', () => {
        return getCurrentUserId();
      });
      expect(result).toBe('run-as-user-id');
    });

    it('should return the function result', () => {
      const result = runAsUser('any-user', () => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it('should support async functions', async () => {
      const result = await runAsUser('async-user', async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1));
        return getCurrentUserId();
      });
      expect(result).toBe('async-user');
    });

    it('should not leak userId outside the callback', () => {
      runAsUser('temp-user', () => {
        expect(getCurrentUserId()).toBe('temp-user');
      });
      // Outside runAsUser, userId should revert
      expect(getCurrentUserId()).toBeUndefined();
    });

    it('should propagate errors from the callback', () => {
      expect(() => {
        runAsUser('error-user', () => {
          throw new Error('callback error');
        });
      }).toThrow('callback error');
    });
  });

  describe('nested context isolation', () => {
    it('should isolate nested runAsUser calls', () => {
      runAsUser('outer-user', () => {
        expect(getCurrentUserId()).toBe('outer-user');

        runAsUser('inner-user', () => {
          expect(getCurrentUserId()).toBe('inner-user');
        });

        // After inner runAsUser exits, outer should be restored
        expect(getCurrentUserId()).toBe('outer-user');
      });
    });

    it('should isolate runAsUser inside middleware context', (done) => {
      const req = mockReq() as Request;
      const res = mockRes() as Response;
      const next: NextFunction = () => {
        setCurrentUserId('middleware-user');
        expect(getCurrentUserId()).toBe('middleware-user');

        runAsUser('override-user', () => {
          expect(getCurrentUserId()).toBe('override-user');
        });

        // Middleware user should be restored
        expect(getCurrentUserId()).toBe('middleware-user');
        done();
      };
      requestContextMiddleware(req, res, next);
    });
  });

  describe('concurrent request isolation', () => {
    it('should isolate concurrent requests from each other', async () => {
      const results: string[] = [];

      const request1 = new Promise<void>((resolve) => {
        const req = mockReq({ 'x-request-id': 'req-1' }) as Request;
        const res = mockRes() as Response;
        requestContextMiddleware(req, res, async () => {
          setCurrentUserId('user-1');
          // Yield to allow request2 to run
          await new Promise((r) => setTimeout(r, 10));
          results.push(`req1:${getCurrentUserId()}`);
          resolve();
        });
      });

      const request2 = new Promise<void>((resolve) => {
        const req = mockReq({ 'x-request-id': 'req-2' }) as Request;
        const res = mockRes() as Response;
        requestContextMiddleware(req, res, async () => {
          setCurrentUserId('user-2');
          // Yield to allow request1 to run
          await new Promise((r) => setTimeout(r, 5));
          results.push(`req2:${getCurrentUserId()}`);
          resolve();
        });
      });

      await Promise.all([request1, request2]);

      expect(results).toContain('req1:user-1');
      expect(results).toContain('req2:user-2');
    });

    it('should isolate request IDs across concurrent requests', async () => {
      const ids: (string | undefined)[] = [];

      const request1 = new Promise<void>((resolve) => {
        const req = mockReq({ 'x-request-id': 'trace-aaa' }) as Request;
        const res = mockRes() as Response;
        requestContextMiddleware(req, res, async () => {
          await new Promise((r) => setTimeout(r, 5));
          ids.push(getCurrentRequestId());
          resolve();
        });
      });

      const request2 = new Promise<void>((resolve) => {
        const req = mockReq({ 'x-request-id': 'trace-bbb' }) as Request;
        const res = mockRes() as Response;
        requestContextMiddleware(req, res, async () => {
          await new Promise((r) => setTimeout(r, 5));
          ids.push(getCurrentRequestId());
          resolve();
        });
      });

      await Promise.all([request1, request2]);

      expect(ids).toContain('trace-aaa');
      expect(ids).toContain('trace-bbb');
    });
  });
});
