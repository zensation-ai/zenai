jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import * as inviteService from '../../../services/workspace-invitation-service';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('workspace-invitation-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('createInvitation', () => {
    it('creates invitation with token and expiry', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1', workspace_id: 'ws-1', email: 'bob@test.com',
          role: 'member', invited_by: 'user-1', token: 'abc123',
          expires_at: '2026-04-09T00:00:00Z', accepted_at: null,
        }],
      } as any);

      const result = await inviteService.createInvitation({
        workspaceId: 'ws-1', email: 'bob@test.com', role: 'member', invitedBy: 'user-1',
      });

      expect(result.email).toBe('bob@test.com');
      expect(result.token).toBeDefined();
      expect(result.accepted_at).toBeNull();
    });

    it('throws when email already invited', async () => {
      mockQueryPublic.mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { code: '23505' })
      );

      await expect(
        inviteService.createInvitation({ workspaceId: 'ws-1', email: 'x@test.com', role: 'member', invitedBy: 'user-1' })
      ).rejects.toThrow();
    });
  });

  describe('acceptInvitation', () => {
    it('accepts valid token and adds member', async () => {
      // Find invitation
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1', workspace_id: 'ws-1', email: 'bob@test.com',
          role: 'member', expires_at: new Date(Date.now() + 86400000).toISOString(),
          accepted_at: null,
        }],
      } as any);
      // Mark accepted
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] } as any);
      // Add member
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', user_id: 'user-2', role: 'member' }],
      } as any);
      // Add org member
      mockQueryPublic.mockResolvedValueOnce({ rows: [{}] } as any);

      const result = await inviteService.acceptInvitation('abc123', 'user-2');
      expect(result.workspace_id).toBe('ws-1');
      expect(result.role).toBe('member');
    });

    it('rejects expired token', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1', expires_at: '2020-01-01T00:00:00Z', accepted_at: null,
        }],
      } as any);

      await expect(inviteService.acceptInvitation('expired', 'user-2'))
        .rejects.toThrow('Invitation has expired');
    });

    it('rejects already-accepted token', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1', expires_at: new Date(Date.now() + 86400000).toISOString(),
          accepted_at: '2026-04-01T00:00:00Z',
        }],
      } as any);

      await expect(inviteService.acceptInvitation('used', 'user-2'))
        .rejects.toThrow('Invitation already accepted');
    });

    it('rejects unknown token', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      await expect(inviteService.acceptInvitation('unknown', 'user-2'))
        .rejects.toThrow('Invitation not found');
    });
  });

  describe('listPendingInvitations', () => {
    it('returns pending invitations for workspace', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'inv-1', email: 'a@test.com', role: 'member', expires_at: '2026-04-09T00:00:00Z' },
        ],
      } as any);

      const result = await inviteService.listPendingInvitations('ws-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('revokeInvitation', () => {
    it('deletes invitation', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] } as any);
      expect(await inviteService.revokeInvitation('inv-1')).toBe(true);
    });
  });
});
