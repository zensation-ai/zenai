/**
 * Phase 66: Per-Request Context via AsyncLocalStorage
 *
 * Stores the authenticated user's ID for the duration of each HTTP request.
 * database-context.ts reads this automatically to SET app.current_user_id
 * on every PostgreSQL connection, enabling RLS policies.
 *
 * This approach avoids changing the queryContext() signature (which has 400+ callers).
 *
 * Flow:
 * 1. requestContextMiddleware wraps every request in AsyncLocalStorage
 * 2. Auth middleware (jwt-auth.ts / auth.ts) calls setCurrentUserId() after authenticating
 * 3. queryContext reads getCurrentUserId() and SETs app.current_user_id on the PG connection
 * 4. RLS policies use current_setting('app.current_user_id') for row filtering
 */

import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';

interface RequestContextData {
  /** Authenticated user's UUID (from JWT or API key). Mutable — set by auth middleware. */
  userId?: string;
  /** Request ID for tracing correlation */
  requestId?: string;
}

/**
 * AsyncLocalStorage instance that flows through the entire request lifecycle.
 * Each HTTP request gets its own isolated store.
 */
export const requestContext = new AsyncLocalStorage<RequestContextData>();

/**
 * Express middleware that wraps every request in AsyncLocalStorage.
 * Must be registered EARLY in the middleware stack (before auth and routes).
 *
 * The store starts empty — auth middleware populates userId later via setCurrentUserId().
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const store: RequestContextData = {
    requestId: req.headers['x-request-id'] as string | undefined,
  };
  requestContext.run(store, () => next());
}

/**
 * Set the current user ID in the request context.
 * Called by auth middleware after successful authentication.
 * This value is read by queryContext to SET app.current_user_id for RLS.
 */
export function setCurrentUserId(userId: string): void {
  const store = requestContext.getStore();
  if (store) {
    store.userId = userId;
  }
}

/**
 * Get the current user ID from the request context.
 * Returns undefined if called outside of a request (e.g., background jobs, startup).
 */
export function getCurrentUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}

/**
 * Set the current request ID in the request context.
 * Called by requestIdMiddleware after generating/reading the requestId.
 * This ensures the requestId is available even when the middleware
 * generates a new UUID (not just from the x-request-id header).
 */
export function setRequestId(requestId: string): void {
  const store = requestContext.getStore();
  if (store) {
    store.requestId = requestId;
  }
}

/**
 * Get the current request ID from the request context.
 */
export function getCurrentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/**
 * Run a function within a specific user context.
 * Useful for background jobs, queue workers, and tests that need
 * to execute queries as a specific user.
 *
 * @example
 * await runAsUser('user-uuid-here', async () => {
 *   await queryContext('personal', 'SELECT * FROM ideas');
 *   // RLS will filter to only this user's data
 * });
 */
export function runAsUser<T>(userId: string, fn: () => T): T {
  return requestContext.run({ userId }, fn);
}
