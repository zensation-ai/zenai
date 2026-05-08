jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import * as orgService from '../../../services/organization-service';
import type { Organization, Workspace, WorkspaceContext } from '../../../types/multi-tenancy';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('organization-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('generateSlug', () => {
    it('converts name to lowercase kebab-case', () => {
      expect(orgService.generateSlug('My Test Org')).toBe('my-test-org');
    });

    it('removes special characters', () => {
      expect(orgService.generateSlug('Zensation GmbH & Co.')).toBe('zensation-gmbh-co');
    });

    it('truncates to 50 characters', () => {
      const long = 'A'.repeat(60);
      expect(orgService.generateSlug(long).length).toBeLessThanOrEqual(50);
    });
  });

  describe('createOrganization', () => {
    it('creates org with default workspace and 4 contexts via CTE', async () => {
      const mockOrg: Organization = {
        id: 'org-1', name: 'Test Org', slug: 'test-org', plan: 'free',
        owner_id: 'user-1', logo_url: null, settings: {}, sso_config: null,
        created_at: '2026-04-02T00:00:00Z', updated_at: '2026-04-02T00:00:00Z',
      };
      const mockWs: Workspace = {
        id: 'ws-1', org_id: 'org-1', name: 'Default', slug: 'default',
        icon: null, color: '#6366f1', ai_persona: {}, settings: {},
        created_at: '2026-04-02T00:00:00Z', updated_at: '2026-04-02T00:00:00Z',
      };
      const mockContexts: WorkspaceContext[] = [
        { id: 'ctx-1', workspace_id: 'ws-1', name: 'Operations', slug: 'operations', base_schema: 'operations', icon: null, color: null, sort_order: 1, archived_at: null, created_at: '2026-04-02T00:00:00Z' },
        { id: 'ctx-2', workspace_id: 'ws-1', name: 'Finance', slug: 'finance', base_schema: 'finance', icon: null, color: null, sort_order: 2, archived_at: null, created_at: '2026-04-02T00:00:00Z' },
        { id: 'ctx-3', workspace_id: 'ws-1', name: 'Learning', slug: 'people', base_schema: 'people', icon: null, color: null, sort_order: 3, archived_at: null, created_at: '2026-04-02T00:00:00Z' },
        { id: 'ctx-4', workspace_id: 'ws-1', name: 'Strategy', slug: 'strategy', base_schema: 'strategy', icon: null, color: null, sort_order: 4, archived_at: null, created_at: '2026-04-02T00:00:00Z' },
      ];

      // CTE query returns org, workspace, contexts in one call
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ org: mockOrg, workspace: mockWs, contexts: JSON.stringify(mockContexts) }],
      } as any);

      const result = await orgService.createOrganization({
        name: 'Test Org',
        ownerId: 'user-1',
      });

      expect(result.org.name).toBe('Test Org');
      expect(result.org.slug).toBe('test-org');
      expect(result.org.plan).toBe('free');
      expect(result.workspace.name).toBe('Default');
      expect(result.contexts).toHaveLength(4);
      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
    });

    it('throws on duplicate slug', async () => {
      mockQueryPublic.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' })
      );

      await expect(
        orgService.createOrganization({ name: 'Test', ownerId: 'user-1' })
      ).rejects.toThrow('Organization slug already exists');
    });
  });

  describe('getOrganization', () => {
    it('returns org with member count', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'org-1', name: 'Test', slug: 'test', plan: 'free',
          owner_id: 'user-1', member_count: 3,
          logo_url: null, settings: {}, sso_config: null,
          created_at: '2026-04-02T00:00:00Z', updated_at: '2026-04-02T00:00:00Z',
        }],
      } as any);

      const result = await orgService.getOrganization('org-1', 'user-1');
      expect(result?.name).toBe('Test');
      expect(result?.member_count).toBe(3);
    });

    it('returns null for non-member', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      const result = await orgService.getOrganization('org-1', 'non-member');
      expect(result).toBeNull();
    });
  });

  describe('listUserOrganizations', () => {
    it('returns all orgs where user is member', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'org-1', name: 'Org A', slug: 'org-a', role: 'owner' },
          { id: 'org-2', name: 'Org B', slug: 'org-b', role: 'member' },
        ],
      } as any);

      const result = await orgService.listUserOrganizations('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('owner');
    });
  });

  describe('updateOrganization', () => {
    it('updates name and settings', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'org-1', name: 'Updated', slug: 'test', plan: 'free', owner_id: 'user-1', settings: { theme: 'dark' }, logo_url: null, sso_config: null, created_at: '2026-04-02T00:00:00Z', updated_at: '2026-04-02T00:00:00Z' }],
      } as any);

      const result = await orgService.updateOrganization('org-1', { name: 'Updated', settings: { theme: 'dark' } });
      expect(result.name).toBe('Updated');
    });

    it('returns null when org not found', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      const result = await orgService.updateOrganization('missing', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deleteOrganization', () => {
    it('deletes org and cascades', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'org-1' }] } as any);
      const result = await orgService.deleteOrganization('org-1');
      expect(result).toBe(true);
    });

    it('returns false when org not found', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      const result = await orgService.deleteOrganization('missing');
      expect(result).toBe(false);
    });
  });
});
