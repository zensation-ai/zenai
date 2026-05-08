jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import * as orgService from '../../../services/organization-service';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('organization-service member management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('listMembers', () => {
    it('returns members with user details', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { org_id: 'org-1', user_id: 'u-1', role: 'owner', email: 'owner@test.com', display_name: 'Owner' },
          { org_id: 'org-1', user_id: 'u-2', role: 'member', email: 'member@test.com', display_name: 'Member' },
        ],
      } as any);

      const result = await orgService.listMembers('org-1');
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('owner@test.com');
      expect(result[1].role).toBe('member');
    });

    it('returns empty array for no members', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      const result = await orgService.listMembers('org-empty');
      expect(result).toEqual([]);
    });
  });

  describe('addMember', () => {
    it('adds a new member', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ org_id: 'org-1', user_id: 'u-2', role: 'member', invited_by: 'u-1', joined_at: '2026-04-04T00:00:00Z' }],
      } as any);

      const result = await orgService.addMember('org-1', 'u-2', 'member', 'u-1');
      expect(result.user_id).toBe('u-2');
      expect(result.role).toBe('member');
    });

    it('upserts existing member with new role', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ org_id: 'org-1', user_id: 'u-2', role: 'admin', invited_by: null, joined_at: '2026-04-04T00:00:00Z' }],
      } as any);

      const result = await orgService.addMember('org-1', 'u-2', 'admin');
      expect(result.role).toBe('admin');
    });
  });

  describe('updateMemberRole', () => {
    it('updates member role', async () => {
      // First query: check current role
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'member' }] } as any);
      // Second query: update
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ org_id: 'org-1', user_id: 'u-2', role: 'admin' }],
      } as any);

      const result = await orgService.updateMemberRole('org-1', 'u-2', 'admin');
      expect(result?.role).toBe('admin');
    });

    it('throws when trying to change owner role', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'owner' }] } as any);

      await expect(
        orgService.updateMemberRole('org-1', 'u-1', 'admin')
      ).rejects.toThrow('Cannot change owner role directly');
    });

    it('returns null for non-existing member', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      const result = await orgService.updateMemberRole('org-1', 'u-x', 'admin');
      expect(result).toBeNull();
    });
  });

  describe('removeMember', () => {
    it('removes a member', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'member' }] } as any);
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ user_id: 'u-2' }] } as any);

      const result = await orgService.removeMember('org-1', 'u-2');
      expect(result).toBe(true);
    });

    it('throws when trying to remove owner', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'owner' }] } as any);

      await expect(
        orgService.removeMember('org-1', 'u-1')
      ).rejects.toThrow('Cannot remove organization owner');
    });

    it('returns false for non-existing member', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ role: 'member' }] } as any);
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      const result = await orgService.removeMember('org-1', 'u-x');
      expect(result).toBe(false);
    });
  });

  describe('transferOwnership', () => {
    it('transfers ownership atomically', async () => {
      // Verify new owner is member
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ org_id: 'org-1', user_id: 'u-2', role: 'admin' }] } as any);
      // CTE update
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      await expect(
        orgService.transferOwnership('org-1', 'u-1', 'u-2')
      ).resolves.toBeUndefined();
      expect(mockQueryPublic).toHaveBeenCalledTimes(2);
    });

    it('throws when new owner is not a member', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      await expect(
        orgService.transferOwnership('org-1', 'u-1', 'u-x')
      ).rejects.toThrow('New owner must be an organization member');
    });
  });
});
