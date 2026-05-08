jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import * as wsService from '../../../services/workspace-service';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('workspace-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  // --- Workspace CRUD ---

  describe('createWorkspace', () => {
    it('creates workspace with default contexts', async () => {
      mockQueryPublic
        // Check org membership
        .mockResolvedValueOnce({ rows: [{ role: 'owner', plan: 'pro' }] } as any)
        // Check workspace count
        .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any)
        // CTE: insert workspace + member + contexts
        .mockResolvedValueOnce({
          rows: [{
            workspace: { id: 'ws-2', org_id: 'org-1', name: 'Dev', slug: 'dev', color: '#10b981' },
            contexts: [
              { id: 'c1', name: 'Operations', slug: 'operations', base_schema: 'operations', sort_order: 1 },
              { id: 'c2', name: 'Finance', slug: 'finance', base_schema: 'finance', sort_order: 2 },
              { id: 'c3', name: 'People', slug: 'people', base_schema: 'people', sort_order: 3 },
              { id: 'c4', name: 'Strategy', slug: 'strategy', base_schema: 'strategy', sort_order: 4 },
            ],
          }],
        } as any);

      const result = await wsService.createWorkspace({
        orgId: 'org-1', name: 'Dev', color: '#10b981', createdBy: 'user-1',
      });

      expect(result.workspace.name).toBe('Dev');
      expect(result.contexts).toHaveLength(4);
    });

    it('throws when plan workspace limit exceeded', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ role: 'owner', plan: 'free' }] } as any)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);  // Free = max 1

      await expect(
        wsService.createWorkspace({ orgId: 'org-1', name: 'Second', createdBy: 'user-1' })
      ).rejects.toThrow('Workspace limit reached');
    });

    it('throws when user is not org owner/admin', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'member' }] } as any);

      await expect(
        wsService.createWorkspace({ orgId: 'org-1', name: 'X', createdBy: 'user-1' })
      ).rejects.toThrow('Only org owner or admin can create workspaces');
    });
  });

  describe('getWorkspace', () => {
    it('returns workspace with contexts and member count', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'ws-1', name: 'Default', slug: 'default', org_id: 'org-1',
          member_count: 3, color: '#6366f1',
        }],
      } as any);

      const result = await wsService.getWorkspace('ws-1');
      expect(result?.name).toBe('Default');
      expect(result?.member_count).toBe(3);
    });
  });

  describe('listOrgWorkspaces', () => {
    it('returns workspaces for org', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'ws-1', name: 'Default', slug: 'default' },
          { id: 'ws-2', name: 'Dev', slug: 'dev' },
        ],
      } as any);

      const result = await wsService.listOrgWorkspaces('org-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('updateWorkspace', () => {
    it('updates name and color', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'ws-1', name: 'Renamed', color: '#ef4444' }],
      } as any);

      const result = await wsService.updateWorkspace('ws-1', { name: 'Renamed', color: '#ef4444' });
      expect(result?.name).toBe('Renamed');
    });
  });

  describe('deleteWorkspace', () => {
    it('soft-deletes workspace', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'ws-1' }] } as any);
      expect(await wsService.deleteWorkspace('ws-1')).toBe(true);
    });
  });

  // --- Context Management ---

  describe('createContext', () => {
    it('creates a new context in a workspace', async () => {
      mockQueryPublic
        // Check context count
        .mockResolvedValueOnce({ rows: [{ count: '4' }] } as any)
        // Check plan limits
        .mockResolvedValueOnce({ rows: [{ plan: 'pro' }] } as any)
        // Max sort order
        .mockResolvedValueOnce({ rows: [{ next: 5 }] } as any)
        // Insert
        .mockResolvedValueOnce({
          rows: [{ id: 'ctx-5', workspace_id: 'ws-1', name: 'Strategy', slug: 'strategy', base_schema: 'finance', sort_order: 5 }],
        } as any);

      const result = await wsService.createContext({
        workspaceId: 'ws-1', name: 'Strategy', baseSchema: 'finance',
      });
      expect(result.name).toBe('Strategy');
      expect(result.base_schema).toBe('finance');
    });
  });

  describe('listContexts', () => {
    it('returns contexts for workspace', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'ctx-1', name: 'Operations', slug: 'operations', base_schema: 'operations', sort_order: 1 },
          { id: 'ctx-2', name: 'Finance', slug: 'finance', base_schema: 'finance', sort_order: 2 },
        ],
      } as any);

      const result = await wsService.listContexts('ws-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getWorkspaceContext', () => {
    it('resolves custom slug to base_schema', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'ctx-1', slug: 'strategisch', base_schema: 'finance' }],
      } as any);

      const result = await wsService.getWorkspaceContext('ws-1', 'strategisch');
      expect(result?.base_schema).toBe('finance');
    });

    it('returns null for unknown slug', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      expect(await wsService.getWorkspaceContext('ws-1', 'unknown')).toBeNull();
    });
  });

  // --- Member Management ---

  describe('listMembers', () => {
    it('returns workspace members with user info', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { user_id: 'u1', role: 'owner', email: 'a@test.com', display_name: 'Alice' },
          { user_id: 'u2', role: 'member', email: 'b@test.com', display_name: 'Bob' },
        ],
      } as any);

      const result = await wsService.listMembers('ws-1');
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('owner');
    });
  });

  describe('addMember', () => {
    it('adds member with specified role', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', user_id: 'u2', role: 'member' }],
      } as any);

      const result = await wsService.addMember('ws-1', 'u2', 'member');
      expect(result.role).toBe('member');
    });
  });

  describe('updateMemberRole', () => {
    it('updates role', async () => {
      // Check current role (not owner)
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', user_id: 'u2', role: 'member' }],
      } as any);
      // Update role
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', user_id: 'u2', role: 'admin' }],
      } as any);

      const result = await wsService.updateMemberRole('ws-1', 'u2', 'admin');
      expect(result?.role).toBe('admin');
    });

    it('prevents changing owner role', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', user_id: 'u1', role: 'owner' }],
      } as any);

      await expect(
        wsService.updateMemberRole('ws-1', 'u1', 'member')
      ).rejects.toThrow('Cannot change owner role');
    });
  });

  describe('removeMember', () => {
    it('removes non-owner member', async () => {
      // Check member role
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'member' }] } as any);
      // Delete
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ user_id: 'u2' }] } as any);

      expect(await wsService.removeMember('ws-1', 'u2')).toBe(true);
    });

    it('prevents removing owner', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'owner' }] } as any);

      await expect(
        wsService.removeMember('ws-1', 'u1')
      ).rejects.toThrow('Cannot remove workspace owner');
    });
  });

  describe('transferOwnership', () => {
    it('transfers ownership to another member', async () => {
      // Check new owner is a member
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-1', user_id: 'new-owner', role: 'member' }] } as any);
      // Atomic CTE: demote + promote
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      await wsService.transferOwnership('ws-1', 'old-owner', 'new-owner');
      expect(mockQueryPublic).toHaveBeenCalledTimes(2);
    });

    it('rejects transfer to non-member', async () => {
      // Check membership returns null
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      await expect(
        wsService.transferOwnership('ws-1', 'old-owner', 'non-member')
      ).rejects.toThrow('New owner must be a workspace member');
    });
  });
});
