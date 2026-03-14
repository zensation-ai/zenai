/**
 * Phase 62: Role-Based Access Control (RBAC) Middleware
 *
 * Builds on Phase 56 JWT auth. Checks req.jwtUser?.role for JWT-authenticated
 * users, defaults to 'viewer' for API key auth.
 *
 * Roles:
 * - admin: full access (CRUD all resources, user management, system config)
 * - editor: read + write (CRUD own resources, no user management)
 * - viewer: read-only (GET endpoints only)
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ===========================================
// Role Definitions
// ===========================================

export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Permission actions that can be checked against roles.
 */
export type PermissionAction =
  | 'read'
  | 'write'
  | 'delete'
  | 'manage_users'
  | 'manage_system'
  | 'view_audit_log'
  | 'manage_rate_limits';

/**
 * Permission matrix: which roles can perform which actions.
 */
const PERMISSION_MATRIX: Record<Role, Set<PermissionAction>> = {
  admin: new Set([
    'read',
    'write',
    'delete',
    'manage_users',
    'manage_system',
    'view_audit_log',
    'manage_rate_limits',
  ]),
  editor: new Set([
    'read',
    'write',
    'delete',
  ]),
  viewer: new Set([
    'read',
  ]),
};

/**
 * Check if a role has permission to perform an action.
 */
export function hasPermission(role: string, action: PermissionAction): boolean {
  const permissions = PERMISSION_MATRIX[role as Role];
  if (!permissions) return false;
  return permissions.has(action);
}

/**
 * Get the effective role for a request.
 * JWT users get their stored role, API key users default to 'viewer'.
 */
export function getEffectiveRole(req: Request): string {
  // JWT-authenticated users have their role set
  if (req.jwtUser?.role) {
    return req.jwtUser.role;
  }

  // API key authenticated users default to viewer
  // Admin scope on API key maps to admin role
  if (req.apiKey) {
    if (req.apiKey.scopes.includes('admin')) {
      return ROLES.ADMIN;
    }
    if (req.apiKey.scopes.includes('write')) {
      return ROLES.EDITOR;
    }
    return ROLES.VIEWER;
  }

  return ROLES.VIEWER;
}

/**
 * RBAC middleware factory.
 *
 * Returns Express middleware that checks if the authenticated user
 * has one of the required roles.
 *
 * Usage:
 *   router.get('/admin-only', jwtAuth, requireRole('admin'), handler);
 *   router.get('/editors', jwtAuth, requireRole('admin', 'editor'), handler);
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const effectiveRole = getEffectiveRole(req);

    if (roles.includes(effectiveRole)) {
      next();
      return;
    }

    logger.warn('RBAC: Insufficient permissions', {
      operation: 'rbac',
      requiredRoles: roles,
      effectiveRole,
      userId: req.jwtUser?.id || req.apiKey?.id || 'unknown',
      path: req.path,
      method: req.method,
    });

    res.status(403).json({
      success: false,
      error: `Insufficient permissions. Required role: ${roles.join(' or ')}. Your role: ${effectiveRole}`,
      code: 'FORBIDDEN',
    });
  };
}
