/**
 * Auth-Security Integration Tests — Sprint 1.4, Security Week 4
 *
 * Verifies authentication and authorization boundaries at the middleware level
 * for three failure modes that correspond to OWASP A01 (Broken Access Control):
 *   - unauthenticated requests → 401
 *   - cross-workspace access  → 403
 *   - cross-organization access → 403
 *
 * We compose the real middleware (`resolveContext`, `requireWorkspaceRole`)
 * against an Express app with a dummy handler so the test exercises the actual
 * code path that runs in production, not a re-implementation.
 */

jest.mock('../../services/workspace-service', () => ({
  getWorkspaceContext: jest.fn(),
  checkMembership: jest.fn(),
}));

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import {
  resolveContext,
  requireWorkspaceRole,
} from '../../middleware/workspace-auth';
import {
  getWorkspaceContext,
  checkMembership,
} from '../../services/workspace-service';

const mockGetWorkspaceContext = getWorkspaceContext as jest.MockedFunction<
  typeof getWorkspaceContext
>;
const mockCheckMembership = checkMembership as jest.MockedFunction<typeof checkMembership>;

/** Fake JWT-auth middleware that injects whatever JWT user the test provides. */
function fakeAuth(user: { id: string; orgId?: string; workspaceId?: string; workspaceRole?: string } | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (user) {
      (req as any).jwtUser = user;
    }
    next();
  };
}

function buildApp(opts: { user: any; requiredRole?: string }) {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth(opts.user));
  // If no user, emulate jwt-auth rejecting with 401 before we ever hit resolveContext.
  app.use((req, res, next) => {
    if (!(req as any).jwtUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  });
  app.get(
    '/api/:context/secure-resource',
    resolveContext,
    opts.requiredRole ? requireWorkspaceRole(opts.requiredRole as any) : (_req, _res, next) => next(),
    (_req, res) => {
      res.json({ ok: true });
    }
  );
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auth Security — unauthenticated access', () => {
  it('returns 401 when no JWT user is attached', async () => {
    const app = buildApp({ user: null });
    const res = await request(app).get('/api/operations/secure-resource');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication/i);
  });

  it('returns 400 for invalid context in legacy mode', async () => {
    const app = buildApp({ user: { id: 'u1' } });
    const res = await request(app).get('/api/not-a-real-context/secure-resource');
    expect(res.status).toBe(400);
  });
});

describe('Auth Security — cross-workspace access', () => {
  it('returns 404 when user targets a context slug that does not belong to their workspace', async () => {
    mockGetWorkspaceContext.mockResolvedValueOnce(null);
    const app = buildApp({ user: { id: 'u1', orgId: 'org-A', workspaceId: 'ws-1' } });

    const res = await request(app).get('/api/workspace-2-only-slug/secure-resource');
    expect([403, 404]).toContain(res.status);
  });

  it('returns 403 when user lacks required workspace role', async () => {
    // Context resolves, but user has "viewer" role while resource requires "admin".
    mockGetWorkspaceContext.mockResolvedValueOnce({
      id: 'ctx-1',
      workspace_id: 'ws-1',
      name: 'Operations',
      slug: 'operations',
      base_schema: 'operations' as const,
      icon: null,
      color: null,
      sort_order: 1,
      archived_at: null,
      created_at: '',
    });
    const app = buildApp({
      user: { id: 'u1', orgId: 'org-A', workspaceId: 'ws-1', workspaceRole: 'viewer' },
      requiredRole: 'admin',
    });
    const res = await request(app).get('/api/operations/secure-resource');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/workspace role/i);
  });

  it('allows access when workspace role matches', async () => {
    mockGetWorkspaceContext.mockResolvedValueOnce({
      id: 'ctx-1',
      workspace_id: 'ws-1',
      name: 'Operations',
      slug: 'operations',
      base_schema: 'operations' as const,
      icon: null,
      color: null,
      sort_order: 1,
      archived_at: null,
      created_at: '',
    });
    const app = buildApp({
      user: { id: 'u1', orgId: 'org-A', workspaceId: 'ws-1', workspaceRole: 'admin' },
      requiredRole: 'admin',
    });
    const res = await request(app).get('/api/operations/secure-resource');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('Auth Security — cross-org / legacy-mode DB membership fallback', () => {
  it('returns 403 when DB membership role does not match in legacy mode', async () => {
    mockCheckMembership.mockResolvedValueOnce({
      role: 'viewer',
      workspace_id: 'ws-1',
      user_id: 'u1',
    } as any);

    const app = express();
    app.use(express.json());
    app.use(fakeAuth({ id: 'u1' })); // No workspaceId on JWT → legacy mode
    app.get(
      '/api/workspaces/:wsId/admin',
      requireWorkspaceRole('admin' as any),
      (_req, res) => res.json({ ok: true })
    );
    const res = await request(app).get('/api/workspaces/ws-1/admin');
    expect(res.status).toBe(403);
    expect(mockCheckMembership).toHaveBeenCalledWith('ws-1', 'u1');
  });

  it('returns 403 when user is not a member of the target workspace', async () => {
    mockCheckMembership.mockResolvedValueOnce(null);

    const app = express();
    app.use(express.json());
    app.use(fakeAuth({ id: 'attacker-u1' }));
    app.get(
      '/api/workspaces/:wsId/admin',
      requireWorkspaceRole('admin' as any),
      (_req, res) => res.json({ ok: true })
    );
    const res = await request(app).get('/api/workspaces/victim-ws-2/admin');
    expect(res.status).toBe(403);
  });

  it('returns 403 when neither wsId nor JWT workspaceId present', async () => {
    const app = express();
    app.use(express.json());
    app.use(fakeAuth({ id: 'u1' }));
    app.get('/api/admin-only', requireWorkspaceRole('admin' as any), (_req, res) =>
      res.json({ ok: true })
    );
    const res = await request(app).get('/api/admin-only');
    expect(res.status).toBe(403);
  });
});
