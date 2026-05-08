// backend/src/middleware/workspace-auth.ts
import { Request, Response, NextFunction } from 'express';
import { getWorkspaceContext } from '../services/workspace-service';
import { setCurrentContextSlug } from '../utils/request-context';
import type { WorkspaceRole } from '../types/multi-tenancy';

const BASE_SCHEMAS = ['operations', 'finance', 'people', 'strategy'];

/**
 * Resolves /:context param to a base_schema.
 * In workspace mode: custom slug → base_schema lookup.
 * In legacy mode: uses context param directly (must be a base schema name).
 */
export async function resolveContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { context } = req.params;
  const workspaceId = (req as any).jwtUser?.workspaceId;

  if (!workspaceId) {
    // Legacy mode: context must be a base schema name
    if (BASE_SCHEMAS.includes(context)) {
      (req as any).resolvedSchema = context;
      (req as any).contextSlug = context;
      return next();
    }
    res.status(400).json({ error: `Invalid context: ${context}` });
    return;
  }

  // Workspace mode: lookup custom slug
  const wsContext = await getWorkspaceContext(workspaceId, context);
  if (wsContext) {
    (req as any).resolvedSchema = wsContext.base_schema;
    (req as any).contextSlug = wsContext.slug;
    setCurrentContextSlug(wsContext.slug);
    return next();
  }

  // Fallback: try as base schema name (backward compat)
  if (BASE_SCHEMAS.includes(context)) {
    (req as any).resolvedSchema = context;
    (req as any).contextSlug = context;
    setCurrentContextSlug(context);
    return next();
  }

  res.status(404).json({ error: 'Context not found in workspace' });
}

/**
 * Middleware factory: requires user to have one of the specified workspace roles.
 * In legacy mode (no workspace in JWT), checks membership from the :wsId route param.
 */
export function requireWorkspaceRole(...roles: WorkspaceRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const jwtUser = (req as any).jwtUser;
    const wsRole = jwtUser?.workspaceRole;

    // Legacy mode: no workspace in JWT — check via DB membership
    if (!jwtUser?.workspaceId) {
      const wsId = req.params.wsId;
      const userId = jwtUser?.id;
      if (!wsId || !userId) {
        res.status(403).json({ error: `Requires workspace role: ${roles.join(' or ')}` });
        return;
      }
      const { checkMembership } = await import('../services/workspace-service');
      const member = await checkMembership(wsId, userId);
      if (!member || !roles.includes(member.role as WorkspaceRole)) {
        res.status(403).json({ error: `Requires workspace role: ${roles.join(' or ')}` });
        return;
      }
      return next();
    }

    if (!wsRole || !roles.includes(wsRole as WorkspaceRole)) {
      res.status(403).json({ error: `Requires workspace role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}
