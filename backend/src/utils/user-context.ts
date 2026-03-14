/**
 * Phase 65: User Context Utilities
 *
 * Central utility for extracting the authenticated user's ID from any request.
 * Works with both JWT auth (req.jwtUser.id) and API Key auth (req.user.id).
 *
 * Backward compatibility: API Key auth without a linked user falls back to
 * SYSTEM_USER_ID so existing single-user data remains accessible.
 */

import { Request } from 'express';

/** Default system user UUID — all pre-multi-user data is assigned to this ID */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Get the authenticated user's ID from the request.
 *
 * Priority:
 * 1. JWT auth → req.jwtUser.id (UUID from JWT sub claim)
 * 2. API Key with user association → req.user.id (if not synthetic)
 * 3. Fallback → SYSTEM_USER_ID (backward compat for API Key auth)
 */
export function getUserId(req: Request): string {
  // JWT-authenticated user (Phase 56)
  if (req.jwtUser?.id) {
    return req.jwtUser.id;
  }

  // API Key with linked user (req.user.id set by jwt-auth.ts or auth.ts)
  // Exclude synthetic IDs like 'api-key' or undefined
  if (req.user?.id && !req.user.id.startsWith('api-key')) {
    return req.user.id;
  }

  // Fallback: system user for backward compatibility
  return SYSTEM_USER_ID;
}

/**
 * Get the authenticated user's ID, or null if not authenticated.
 * Use for optional-auth endpoints where user_id is not required.
 */
export function getOptionalUserId(req: Request): string | null {
  if (req.jwtUser?.id) {
    return req.jwtUser.id;
  }
  if (req.user?.id && !req.user.id.startsWith('api-key')) {
    return req.user.id;
  }
  return null;
}
