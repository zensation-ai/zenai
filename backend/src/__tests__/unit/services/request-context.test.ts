/**
 * Phase 66: Request Context (AsyncLocalStorage) Tests
 */

import {
  requestContext,
  requestContextMiddleware,
  setCurrentUserId,
  getCurrentUserId,
  runAsUser,
} from '../../../utils/request-context';
import { Request, Response, NextFunction } from 'express';

describe('Request Context (AsyncLocalStorage)', () => {
  describe('requestContextMiddleware', () => {
    it('should create a new store and call next', () => {
      const req = { headers: {} } as Request;
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      requestContextMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should preserve request ID from header', (done) => {
      const req = { headers: { 'x-request-id': 'test-req-123' } } as unknown as Request;
      const res = {} as Response;

      requestContextMiddleware(req, res, () => {
        const store = requestContext.getStore();
        expect(store?.requestId).toBe('test-req-123');
        done();
      });
    });
  });

  describe('setCurrentUserId / getCurrentUserId', () => {
    it('should return undefined outside of store context', () => {
      expect(getCurrentUserId()).toBeUndefined();
    });

    it('should set and get userId within store context', (done) => {
      requestContext.run({}, () => {
        setCurrentUserId('user-abc-123');
        expect(getCurrentUserId()).toBe('user-abc-123');
        done();
      });
    });

    it('should not leak userId between contexts', (done) => {
      let doneCount = 0;
      const checkDone = () => { if (++doneCount === 2) done(); };

      requestContext.run({}, () => {
        setCurrentUserId('user-A');
        expect(getCurrentUserId()).toBe('user-A');
        checkDone();
      });

      requestContext.run({}, () => {
        expect(getCurrentUserId()).toBeUndefined();
        checkDone();
      });
    });
  });

  describe('runAsUser', () => {
    it('should run function with specified userId', () => {
      const result = runAsUser('user-xyz', () => {
        return getCurrentUserId();
      });

      expect(result).toBe('user-xyz');
    });

    it('should restore previous context after execution', (done) => {
      requestContext.run({}, () => {
        setCurrentUserId('outer-user');

        runAsUser('inner-user', () => {
          expect(getCurrentUserId()).toBe('inner-user');
        });

        // After runAsUser completes, we're back in the outer context
        expect(getCurrentUserId()).toBe('outer-user');
        done();
      });
    });

    it('should propagate return value', () => {
      const result = runAsUser('user-1', () => 42);
      expect(result).toBe(42);
    });

    it('should propagate errors', () => {
      expect(() => {
        runAsUser('user-1', () => {
          throw new Error('test error');
        });
      }).toThrow('test error');
    });
  });
});
