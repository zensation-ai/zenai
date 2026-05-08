jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import * as orgInvService from '../../../services/organization-invitation-service';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('organization-invitation-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('createInvitation', () => {
    it('creates invitation with token', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1', org_id: 'org-1', email: 'new@test.com', role: 'member',
          invited_by: 'u-1', token: expect.any(String),
          expires_at: '2026-04-11T00:00:00Z', accepted_at: null,
          created_at: '2026-04-04T00:00:00Z',
        }],
      } as any);

      const result = await orgInvService.createInvitation({
        orgId: 'org-1', email: 'New@Test.com', role: 'member', invitedBy: 'u-1',
      });

      expect(result.org_id).toBe('org-1');
      expect(result.email).toBe('new@test.com');
      // Verify email was lowercased in query
      const callArgs = mockQueryPublic.mock.calls[0][1];
      expect(callArgs![1]).toBe('new@test.com');
    });
  });

  describe('acceptInvitation', () => {
    it('accepts valid invitation and creates org member', async () => {
      // Find invitation
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1', org_id: 'org-1', email: 'user@test.com', role: 'member',
          invited_by: 'u-1', token: 'abc', accepted_at: null,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        }],
      } as any);
      // Mark accepted
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      // Insert member
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ org_id: 'org-1', user_id: 'u-2', role: 'member' }],
      } as any);

      const result = await orgInvService.acceptInvitation('abc', 'u-2');
      expect(result.user_id).toBe('u-2');
      expect(mockQueryPublic).toHaveBeenCalledTimes(3);
    });

    it('throws for non-existing invitation', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      await expect(orgInvService.acceptInvitation('bad-token', 'u-2')).rejects.toThrow('Invitation not found');
    });

    it('throws for already accepted invitation', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ accepted_at: '2026-04-01T00:00:00Z', expires_at: '2026-04-11T00:00:00Z' }],
      } as any);
      await expect(orgInvService.acceptInvitation('token', 'u-2')).rejects.toThrow('already accepted');
    });

    it('throws for expired invitation', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ accepted_at: null, expires_at: '2025-01-01T00:00:00Z' }],
      } as any);
      await expect(orgInvService.acceptInvitation('token', 'u-2')).rejects.toThrow('expired');
    });
  });

  describe('getInvitationInfo', () => {
    it('returns invitation with org name', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'inv-1', org_id: 'org-1', org_name: 'My Org', email: 'user@test.com' }],
      } as any);

      const result = await orgInvService.getInvitationInfo('token-abc');
      expect(result?.org_name).toBe('My Org');
    });

    it('returns null for missing token', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      const result = await orgInvService.getInvitationInfo('missing');
      expect(result).toBeNull();
    });
  });

  describe('listPendingInvitations', () => {
    it('returns pending invitations', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'inv-1', email: 'a@t.com' },
          { id: 'inv-2', email: 'b@t.com' },
        ],
      } as any);

      const result = await orgInvService.listPendingInvitations('org-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('revokeInvitation', () => {
    it('deletes invitation', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] } as any);
      const result = await orgInvService.revokeInvitation('inv-1');
      expect(result).toBe(true);
    });

    it('returns false for non-existing', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);
      const result = await orgInvService.revokeInvitation('inv-x');
      expect(result).toBe(false);
    });
  });
});
