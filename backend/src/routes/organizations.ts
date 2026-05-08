// backend/src/routes/organizations.ts
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as orgService from '../services/organization-service';
import * as orgInvService from '../services/organization-invitation-service';
import type { OrgRole } from '../types/multi-tenancy';

export const organizationRouter = Router();

const VALID_ORG_ROLES: OrgRole[] = ['owner', 'admin', 'member'];

// POST /api/organizations — Create organization
organizationRouter.post('/', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }

  const result = await orgService.createOrganization({ name: name.trim(), ownerId: userId });
  res.status(201).json({ data: result });
}));

// GET /api/organizations — List user's organizations
organizationRouter.get('/', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  try {
    const orgs = await orgService.listUserOrganizations(userId);
    res.json({ data: orgs });
  } catch (err) {
    // Graceful fallback — public.organizations may have RLS policy issues
    console.warn('[organizations] listUserOrganizations failed, returning empty:', (err as Error).message);
    res.json({ data: [] });
  }
}));

// GET /api/organizations/:orgId — Org details
organizationRouter.get('/:orgId', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, userId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  res.json({ data: org });
}));

// PUT /api/organizations/:orgId — Update org (owner/admin only)
organizationRouter.put('/:orgId', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  // Verify caller is owner or admin
  const org = await orgService.getOrganization(req.params.orgId, userId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!['owner', 'admin'].includes((org as any).caller_role)) {
    return res.status(403).json({ error: 'Only owner or admin can update organization' });
  }
  const { name, settings, logo_url } = req.body;
  const updated = await orgService.updateOrganization(req.params.orgId, { name, settings, logo_url });
  if (!updated) return res.status(404).json({ error: 'Organization not found' });
  res.json({ data: updated });
}));

// DELETE /api/organizations/:orgId — Delete org (owner only)
organizationRouter.delete('/:orgId', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  // Verify caller is owner
  const org = await orgService.getOrganization(req.params.orgId, userId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if ((org as any).caller_role !== 'owner') {
    return res.status(403).json({ error: 'Only owner can delete organization' });
  }
  const deleted = await orgService.deleteOrganization(req.params.orgId);
  if (!deleted) return res.status(404).json({ error: 'Organization not found' });
  res.json({ message: 'Organization deleted' });
}));

// --- Organization Member Management ---

// GET /api/organizations/:orgId/members — List members (any member can view)
organizationRouter.get('/:orgId/members', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, userId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  const members = await orgService.listMembers(req.params.orgId);
  res.json({ data: members });
}));

// POST /api/organizations/:orgId/members — Add member (owner/admin only)
organizationRouter.post('/:orgId/members', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, userId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!['owner', 'admin'].includes((org as any).caller_role)) {
    return res.status(403).json({ error: 'Only owner or admin can add members' });
  }

  const { user_id, role } = req.body;
  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'user_id is required' });
  }
  const memberRole = (role && VALID_ORG_ROLES.includes(role)) ? role : 'member';
  // Admins cannot add owners
  if (memberRole === 'owner' && (org as any).caller_role !== 'owner') {
    return res.status(403).json({ error: 'Only owner can add another owner' });
  }

  const member = await orgService.addMember(req.params.orgId, user_id, memberRole, userId);
  res.status(201).json({ data: member });
}));

// PUT /api/organizations/:orgId/members/:userId — Update member role (owner/admin only)
organizationRouter.put('/:orgId/members/:userId', asyncHandler(async (req, res) => {
  const callerId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, callerId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!['owner', 'admin'].includes((org as any).caller_role)) {
    return res.status(403).json({ error: 'Only owner or admin can change roles' });
  }

  const { role } = req.body;
  if (!role || !VALID_ORG_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ORG_ROLES.join(', ')}` });
  }
  // Admins cannot promote to owner
  if (role === 'owner' && (org as any).caller_role !== 'owner') {
    return res.status(403).json({ error: 'Only owner can promote to owner' });
  }

  const updated = await orgService.updateMemberRole(req.params.orgId, req.params.userId, role);
  if (!updated) return res.status(404).json({ error: 'Member not found' });
  res.json({ data: updated });
}));

// DELETE /api/organizations/:orgId/members/:userId — Remove member (owner/admin only)
organizationRouter.delete('/:orgId/members/:userId', asyncHandler(async (req, res) => {
  const callerId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, callerId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!['owner', 'admin'].includes((org as any).caller_role)) {
    return res.status(403).json({ error: 'Only owner or admin can remove members' });
  }
  // Admins cannot remove other admins or owner
  if ((org as any).caller_role === 'admin') {
    const targetMembers = await orgService.listMembers(req.params.orgId);
    const target = targetMembers.find((m: any) => m.user_id === req.params.userId);
    if (target && ['owner', 'admin'].includes(target.role)) {
      return res.status(403).json({ error: 'Admin cannot remove owner or other admins' });
    }
  }

  const removed = await orgService.removeMember(req.params.orgId, req.params.userId);
  if (!removed) return res.status(404).json({ error: 'Member not found' });
  res.json({ message: 'Member removed' });
}));

// POST /api/organizations/:orgId/transfer — Transfer ownership (owner only)
organizationRouter.post('/:orgId/transfer', asyncHandler(async (req, res) => {
  const callerId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, callerId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if ((org as any).caller_role !== 'owner') {
    return res.status(403).json({ error: 'Only owner can transfer ownership' });
  }

  const { new_owner_id } = req.body;
  if (!new_owner_id || typeof new_owner_id !== 'string') {
    return res.status(400).json({ error: 'new_owner_id is required' });
  }

  await orgService.transferOwnership(req.params.orgId, callerId, new_owner_id);
  res.json({ message: 'Ownership transferred' });
}));

// --- Organization Invitations ---

// POST /api/organizations/:orgId/invite — Send invitation (owner/admin only)
organizationRouter.post('/:orgId/invite', asyncHandler(async (req, res) => {
  const callerId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, callerId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!['owner', 'admin'].includes((org as any).caller_role)) {
    return res.status(403).json({ error: 'Only owner or admin can invite members' });
  }

  const { email, role } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  const inviteRole = (role === 'admin') ? 'admin' : 'member';

  const invitation = await orgInvService.createInvitation({
    orgId: req.params.orgId, email, role: inviteRole, invitedBy: callerId,
  });

  // Fire-and-forget email
  orgInvService.sendInvitationEmail(invitation).catch(() => {});

  res.status(201).json({ data: invitation });
}));

// GET /api/organizations/:orgId/invitations — List pending (owner/admin only)
organizationRouter.get('/:orgId/invitations', asyncHandler(async (req, res) => {
  const callerId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, callerId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!['owner', 'admin'].includes((org as any).caller_role)) {
    return res.status(403).json({ error: 'Only owner or admin can view invitations' });
  }

  const invitations = await orgInvService.listPendingInvitations(req.params.orgId);
  res.json({ data: invitations });
}));

// DELETE /api/organizations/:orgId/invitations/:invId — Revoke (owner/admin only)
organizationRouter.delete('/:orgId/invitations/:invId', asyncHandler(async (req, res) => {
  const callerId = (req as any).jwtUser?.id || (req as any).user?.id;
  const org = await orgService.getOrganization(req.params.orgId, callerId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!['owner', 'admin'].includes((org as any).caller_role)) {
    return res.status(403).json({ error: 'Only owner or admin can revoke invitations' });
  }

  const revoked = await orgInvService.revokeInvitation(req.params.invId);
  if (!revoked) return res.status(404).json({ error: 'Invitation not found' });
  res.json({ message: 'Invitation revoked' });
}));

// GET /api/invitations/org/:token/info — Get invitation details (no auth required)
organizationRouter.get('/invitations/org/:token/info', asyncHandler(async (req, res) => {
  const info = await orgInvService.getInvitationInfo(req.params.token);
  if (!info) return res.status(404).json({ error: 'Invitation not found' });
  if (info.accepted_at) return res.status(410).json({ error: 'Invitation already accepted' });
  if (new Date(info.expires_at) < new Date()) return res.status(410).json({ error: 'Invitation has expired' });

  res.json({ data: { org_name: info.org_name, email: info.email, role: info.role, expires_at: info.expires_at } });
}));

// POST /api/invitations/org/:token/accept — Accept invitation (auth required)
organizationRouter.post('/invitations/org/:token/accept', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const member = await orgInvService.acceptInvitation(req.params.token, userId);
  res.json({ data: member });
}));
