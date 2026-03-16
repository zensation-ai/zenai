/**
 * Phase 80: SYSTEM_USER_ID Guard Middleware
 *
 * Prevents SYSTEM_USER_ID (API-key fallback) from accessing sensitive
 * user-specific endpoints. These endpoints require a real authenticated user.
 *
 * SYSTEM_USER_ID is allowed on:
 * - Health/status endpoints
 * - Ideas CRUD (backward compat for single-user mode)
 * - Chat sessions
 * - Documents
 * - Canvas
 * - Knowledge graph / RAG
 * - Topics / analytics
 * - Export / sync
 * - Agent teams / workflows
 * - MCP tools
 * - Code execution
 * - Vision
 * - Project context
 * - Business dashboard
 *
 * SYSTEM_USER_ID is BLOCKED on:
 * - Auth endpoints (profile, password, MFA, sessions)
 * - Email (personal inbox)
 * - Contacts / CRM
 * - Finance (bank accounts, transactions)
 * - Calendar accounts (OAuth-linked)
 * - Screen memory (personal captures)
 * - Voice settings (personal voice config)
 * - Security admin endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { SYSTEM_USER_ID } from '../utils/user-context';
import { logger } from '../utils/logger';

/**
 * Route prefixes where SYSTEM_USER_ID is NOT allowed.
 * These contain personal/sensitive user data.
 */
const BLOCKED_ROUTE_PREFIXES = [
  '/api/auth/profile',
  '/api/auth/change-password',
  '/api/auth/mfa',
  '/api/auth/sessions',
  '/api/auth/logout-all',
  // Email - personal inbox
  '/emails',
  // Contacts - personal CRM
  '/contacts',
  '/organizations',
  // Finance - bank accounts, transactions
  '/finance',
  // Screen memory - personal captures
  '/screen-memory',
  // Voice settings - personal config
  '/voice/settings',
  // Calendar accounts - OAuth-linked
  '/calendar-accounts',
];

/**
 * Checks if the current request path matches any blocked prefix.
 * Handles both direct paths (/api/auth/profile) and context-prefixed
 * paths (/api/:context/emails).
 */
function isBlockedRoute(path: string): boolean {
  // Normalize: strip /api/:context/ prefix to get the resource path
  const normalized = path.replace(/^\/api\/(?:personal|work|learning|creative)\//, '/');

  for (const prefix of BLOCKED_ROUTE_PREFIXES) {
    if (path.includes(prefix) || normalized.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Middleware that rejects requests from SYSTEM_USER_ID on sensitive endpoints.
 *
 * Usage: Add after auth middleware in the middleware chain.
 * Only blocks requests where getUserId() would return SYSTEM_USER_ID
 * AND the route is in the blocked list.
 */
export function systemUserGuard(req: Request, res: Response, next: NextFunction): void {
  // Only check if we have a user context
  const userId = req.jwtUser?.id
    || (req.user?.id && !req.user.id.startsWith('api-key') ? req.user.id : null);

  // If user is authenticated with a real ID, allow through
  if (userId && userId !== SYSTEM_USER_ID) {
    return next();
  }

  // Check if this is a SYSTEM_USER_ID request hitting a blocked route
  if (isBlockedRoute(req.path)) {
    logger.warn(`SYSTEM_USER_ID blocked on sensitive endpoint: ${req.method} ${req.path}`);
    res.status(403).json({
      success: false,
      error: 'This endpoint requires a real authenticated user. API key access with SYSTEM_USER_ID is not allowed.',
      code: 'SYSTEM_USER_BLOCKED',
    });
    return;
  }

  next();
}

/**
 * Export blocked routes for testing and documentation.
 */
export const BLOCKED_ROUTES = BLOCKED_ROUTE_PREFIXES;
export { isBlockedRoute };
