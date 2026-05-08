jest.mock('../../../services/organization-service');
jest.mock('../../../services/organization-invitation-service');

import express from 'express';
import request from 'supertest';
import { organizationRouter } from '../../../routes/organizations';
import { errorHandler } from '../../../middleware/errorHandler';
import * as orgService from '../../../services/organization-service';
import * as orgInvService from '../../../services/organization-invitation-service';

const mockGetOrg = orgService.getOrganization as jest.MockedFunction<typeof orgService.getOrganization>;
const mockListMembers = orgService.listMembers as jest.MockedFunction<typeof orgService.listMembers>;
const mockAddMember = orgService.addMember as jest.MockedFunction<typeof orgService.addMember>;
const mockUpdateMemberRole = orgService.updateMemberRole as jest.MockedFunction<typeof orgService.updateMemberRole>;
const mockRemoveMember = orgService.removeMember as jest.MockedFunction<typeof orgService.removeMember>;
const mockTransferOwnership = orgService.transferOwnership as jest.MockedFunction<typeof orgService.transferOwnership>;
const mockCreateInvitation = orgInvService.createInvitation as jest.MockedFunction<typeof orgInvService.createInvitation>;
const mockListPendingInvitations = orgInvService.listPendingInvitations as jest.MockedFunction<typeof orgInvService.listPendingInvitations>;
const mockRevokeInvitation = orgInvService.revokeInvitation as jest.MockedFunction<typeof orgInvService.revokeInvitation>;
const mockSendInvitationEmail = orgInvService.sendInvitationEmail as jest.MockedFunction<typeof orgInvService.sendInvitationEmail>;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).jwtUser = { id: 'user-1', email: 'test@test.com', role: 'admin' };
  (req as any).user = { id: 'user-1' };
  next();
});
app.use('/api/organizations', organizationRouter);
app.use(errorHandler);

describe('organization member routes', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/organizations/:orgId/members', () => {
    it('returns members for org member', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'member' } as any);
      mockListMembers.mockResolvedValueOnce([
        { user_id: 'u-1', role: 'owner', email: 'a@t.com' },
        { user_id: 'u-2', role: 'member', email: 'b@t.com' },
      ] as any);

      const res = await request(app).get('/api/organizations/org-1/members');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns 404 for non-member', async () => {
      mockGetOrg.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/organizations/org-x/members');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/organizations/:orgId/members', () => {
    it('adds member as owner', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);
      mockAddMember.mockResolvedValueOnce({ org_id: 'org-1', user_id: 'u-3', role: 'member' } as any);

      const res = await request(app)
        .post('/api/organizations/org-1/members')
        .send({ user_id: 'u-3', role: 'member' });

      expect(res.status).toBe(201);
      expect(res.body.data.user_id).toBe('u-3');
    });

    it('rejects if not owner/admin', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'member' } as any);

      const res = await request(app)
        .post('/api/organizations/org-1/members')
        .send({ user_id: 'u-3' });

      expect(res.status).toBe(403);
    });

    it('rejects missing user_id', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);

      const res = await request(app)
        .post('/api/organizations/org-1/members')
        .send({});

      expect(res.status).toBe(400);
    });

    it('prevents admin from adding owner', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'admin' } as any);

      const res = await request(app)
        .post('/api/organizations/org-1/members')
        .send({ user_id: 'u-3', role: 'owner' });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/organizations/:orgId/members/:userId', () => {
    it('updates member role', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);
      mockUpdateMemberRole.mockResolvedValueOnce({ org_id: 'org-1', user_id: 'u-2', role: 'admin' } as any);

      const res = await request(app)
        .put('/api/organizations/org-1/members/u-2')
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('admin');
    });

    it('rejects invalid role', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);

      const res = await request(app)
        .put('/api/organizations/org-1/members/u-2')
        .send({ role: 'superadmin' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/organizations/:orgId/members/:userId', () => {
    it('removes member', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);
      mockRemoveMember.mockResolvedValueOnce(true);

      const res = await request(app).delete('/api/organizations/org-1/members/u-2');
      expect(res.status).toBe(200);
    });

    it('admin cannot remove other admin', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'admin' } as any);
      mockListMembers.mockResolvedValueOnce([
        { user_id: 'u-2', role: 'admin' },
      ] as any);

      const res = await request(app).delete('/api/organizations/org-1/members/u-2');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/organizations/:orgId/transfer', () => {
    it('transfers ownership', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);
      mockTransferOwnership.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/organizations/org-1/transfer')
        .send({ new_owner_id: 'u-2' });

      expect(res.status).toBe(200);
    });

    it('rejects non-owner', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'admin' } as any);

      const res = await request(app)
        .post('/api/organizations/org-1/transfer')
        .send({ new_owner_id: 'u-2' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/organizations/:orgId/invite', () => {
    it('creates invitation', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);
      mockCreateInvitation.mockResolvedValueOnce({
        id: 'inv-1', org_id: 'org-1', email: 'new@test.com', role: 'member',
        token: 'abc123', invited_by: 'user-1', expires_at: '2026-04-11T00:00:00Z',
        accepted_at: null, created_at: '2026-04-04T00:00:00Z',
      } as any);
      mockSendInvitationEmail.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/organizations/org-1/invite')
        .send({ email: 'new@test.com', role: 'member' });

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('new@test.com');
    });

    it('rejects invalid email', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);

      const res = await request(app)
        .post('/api/organizations/org-1/invite')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/organizations/:orgId/invitations', () => {
    it('lists pending invitations', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'admin' } as any);
      mockListPendingInvitations.mockResolvedValueOnce([
        { id: 'inv-1', email: 'a@t.com', role: 'member' },
      ] as any);

      const res = await request(app).get('/api/organizations/org-1/invitations');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('DELETE /api/organizations/:orgId/invitations/:invId', () => {
    it('revokes invitation', async () => {
      mockGetOrg.mockResolvedValueOnce({ id: 'org-1', caller_role: 'owner' } as any);
      mockRevokeInvitation.mockResolvedValueOnce(true);

      const res = await request(app).delete('/api/organizations/org-1/invitations/inv-1');
      expect(res.status).toBe(200);
    });
  });
});
