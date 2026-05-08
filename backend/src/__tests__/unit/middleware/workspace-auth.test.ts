jest.mock('../../../services/workspace-service', () => ({
  getWorkspaceContext: jest.fn(),
  checkMembership: jest.fn(),
}));

import { Request, Response, NextFunction } from 'express';
import { resolveContext, requireWorkspaceRole } from '../../../middleware/workspace-auth';
import { getWorkspaceContext, checkMembership } from '../../../services/workspace-service';

const mockGetWorkspaceContext = getWorkspaceContext as jest.MockedFunction<typeof getWorkspaceContext>;
const mockCheckMembership = checkMembership as jest.MockedFunction<typeof checkMembership>;

describe('workspace-auth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, jwtUser: undefined } as any;
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    next = jest.fn();
  });

  describe('resolveContext', () => {
    it('passes through in legacy mode (no workspaceId)', async () => {
      req.params = { context: 'operations' };
      req.jwtUser = { id: 'u1', workspaceId: undefined } as any;

      await resolveContext(req as Request, res as Response, next);

      expect((req as any).resolvedSchema).toBe('operations');
      expect(next).toHaveBeenCalled();
    });

    it('resolves custom slug to base_schema', async () => {
      req.params = { context: 'strategisch' };
      req.jwtUser = { id: 'u1', workspaceId: 'ws-1' } as any;

      mockGetWorkspaceContext.mockResolvedValueOnce({
        id: 'ctx-1', workspace_id: 'ws-1', name: 'Strategisch',
        slug: 'strategisch', base_schema: 'finance' as const,
        icon: null, color: null, sort_order: 2, archived_at: null, created_at: '',
      });

      await resolveContext(req as Request, res as Response, next);

      expect((req as any).resolvedSchema).toBe('finance');
      expect((req as any).contextSlug).toBe('strategisch');
      expect(next).toHaveBeenCalled();
    });

    it('falls back to base schema names for backward compat', async () => {
      req.params = { context: 'finance' };
      req.jwtUser = { id: 'u1', workspaceId: 'ws-1' } as any;
      mockGetWorkspaceContext.mockResolvedValueOnce(null);

      await resolveContext(req as Request, res as Response, next);

      expect((req as any).resolvedSchema).toBe('finance');
      expect(next).toHaveBeenCalled();
    });

    it('returns 404 for unknown context', async () => {
      req.params = { context: 'unknown' };
      req.jwtUser = { id: 'u1', workspaceId: 'ws-1' } as any;
      mockGetWorkspaceContext.mockResolvedValueOnce(null);

      await resolveContext(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireWorkspaceRole', () => {
    it('allows matching role', async () => {
      req.jwtUser = { id: 'u1', workspaceId: 'ws-1', workspaceRole: 'admin' } as any;

      const middleware = requireWorkspaceRole('admin', 'owner');
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('rejects insufficient role', async () => {
      req.jwtUser = { id: 'u1', workspaceId: 'ws-1', workspaceRole: 'viewer' } as any;

      const middleware = requireWorkspaceRole('admin', 'owner');
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('passes in legacy mode when user has required role via DB check', async () => {
      req.jwtUser = { id: 'u1' } as any;
      req.params = { wsId: 'ws-1' };
      mockCheckMembership.mockResolvedValueOnce({ role: 'admin' } as any);

      const middleware = requireWorkspaceRole('admin');
      await middleware(req as Request, res as Response, next);

      expect(mockCheckMembership).toHaveBeenCalledWith('ws-1', 'u1');
      expect(next).toHaveBeenCalled();
    });

    it('rejects in legacy mode when user lacks required role', async () => {
      req.jwtUser = { id: 'u1' } as any;
      req.params = { wsId: 'ws-1' };
      mockCheckMembership.mockResolvedValueOnce({ role: 'viewer' } as any);

      const middleware = requireWorkspaceRole('admin', 'owner');
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects in legacy mode when no wsId param', async () => {
      req.jwtUser = { id: 'u1' } as any;
      req.params = {};

      const middleware = requireWorkspaceRole('admin');
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
