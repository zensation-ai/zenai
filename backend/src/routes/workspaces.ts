// backend/src/routes/workspaces.ts
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as wsService from '../services/workspace-service';
import * as inviteService from '../services/workspace-invitation-service';
import * as auditService from '../services/tenant-audit-service';
import { requireWorkspaceRole } from '../middleware/workspace-auth';

export const workspaceRouter = Router();

// --- Workspace CRUD (nested under org) ---

workspaceRouter.post('/organizations/:orgId/workspaces', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const { name, icon, color } = req.body;
  const result = await wsService.createWorkspace({
    orgId: req.params.orgId, name, icon, color, createdBy: userId,
  });
  res.status(201).json({ data: result });
}));

workspaceRouter.get('/organizations/:orgId/workspaces', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  // Verify org membership via orgService (getOrganization checks membership)
  const orgService = require('../services/organization-service');
  const org = await orgService.getOrganization(req.params.orgId, userId);
  if (!org) return res.status(403).json({ error: 'Not a member of this organization' });
  const workspaces = await wsService.listOrgWorkspaces(req.params.orgId);
  res.json({ data: workspaces });
}));

// --- Workspace detail routes ---

workspaceRouter.get('/workspaces/:wsId', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const member = await wsService.checkMembership(req.params.wsId, userId);
  if (!member) return res.status(403).json({ error: 'Not a member of this workspace' });
  const ws = await wsService.getWorkspace(req.params.wsId);
  if (!ws) return res.status(404).json({ error: 'Workspace not found' });
  res.json({ data: ws });
}));

workspaceRouter.put('/workspaces/:wsId', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { name, icon, color, settings, ai_persona } = req.body;
  const updated = await wsService.updateWorkspace(req.params.wsId, { name, icon, color, settings, ai_persona });
  if (!updated) return res.status(404).json({ error: 'Workspace not found' });
  res.json({ data: updated });
}));

workspaceRouter.delete('/workspaces/:wsId', requireWorkspaceRole('owner'), asyncHandler(async (req, res) => {
  const deleted = await wsService.deleteWorkspace(req.params.wsId);
  if (!deleted) return res.status(404).json({ error: 'Workspace not found' });
  res.json({ message: 'Workspace deleted' });
}));

// --- Context Management ---

workspaceRouter.get('/workspaces/:wsId/contexts', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const member = await wsService.checkMembership(req.params.wsId, userId);
  if (!member) return res.status(403).json({ error: 'Not a member of this workspace' });
  const contexts = await wsService.listContexts(req.params.wsId);
  res.json({ data: contexts });
}));

workspaceRouter.post('/workspaces/:wsId/contexts', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { name, baseSchema, icon, color } = req.body;
  if (!baseSchema || !['operations', 'finance', 'people', 'strategy'].includes(baseSchema)) {
    return res.status(400).json({ error: 'Invalid baseSchema. Allowed: operations, finance, people, strategy' });
  }
  const context = await wsService.createContext({
    workspaceId: req.params.wsId, name, baseSchema, icon, color,
  });
  res.status(201).json({ data: context });
}));

// --- Members ---

workspaceRouter.get('/workspaces/:wsId/members', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const member = await wsService.checkMembership(req.params.wsId, userId);
  if (!member) return res.status(403).json({ error: 'Not a member of this workspace' });
  const members = await wsService.listMembers(req.params.wsId);
  res.json({ data: members });
}));

workspaceRouter.put('/workspaces/:wsId/members/:userId', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { role } = req.body;
  const ALLOWED_ROLES = ['admin', 'member', 'viewer'];
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` });
  }
  const updated = await wsService.updateMemberRole(req.params.wsId, req.params.userId, role);
  if (!updated) return res.status(404).json({ error: 'Member not found' });
  res.json({ data: updated });
}));

workspaceRouter.delete('/workspaces/:wsId/members/:userId', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const removed = await wsService.removeMember(req.params.wsId, req.params.userId);
  if (!removed) return res.status(404).json({ error: 'Member not found' });
  res.json({ message: 'Member removed' });
}));

workspaceRouter.post('/workspaces/:wsId/transfer', requireWorkspaceRole('owner'), asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const { newOwnerId, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password confirmation required for ownership transfer' });
  }
  // Verify password
  const { verifyPassword } = await import('../services/auth/user-service');
  const valid = await verifyPassword(userId, password);
  if (!valid) {
    return res.status(403).json({ error: 'Invalid password' });
  }
  await wsService.transferOwnership(req.params.wsId, userId, newOwnerId);
  res.json({ message: 'Ownership transferred' });
}));

// --- Invitations ---

workspaceRouter.post('/workspaces/:wsId/invite', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const { email, role } = req.body;
  const INVITE_ROLES = ['admin', 'member', 'viewer'];
  if (role && !INVITE_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed: ${INVITE_ROLES.join(', ')}` });
  }
  const invitation = await inviteService.createInvitation({
    workspaceId: req.params.wsId, email, role: role || 'member', invitedBy: userId,
  });
  // Send invitation email (best-effort — don't fail the request)
  try {
    const { sendInvitationEmail } = await import('../services/workspace-invitation-service');
    await sendInvitationEmail(invitation, req.params.wsId);
  } catch (err) {
    const { logger } = await import('../utils/logger');
    logger.warn('Failed to send invitation email', { email, error: (err as Error).message });
  }
  res.status(201).json({ data: invitation });
}));

workspaceRouter.post('/workspaces/:wsId/join', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  const { token } = req.body;
  const member = await inviteService.acceptInvitation(token, userId);
  res.json({ data: member });
}));

workspaceRouter.get('/workspaces/:wsId/invitations', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const invitations = await inviteService.listPendingInvitations(req.params.wsId);
  res.json({ data: invitations });
}));

workspaceRouter.delete('/workspaces/:wsId/invitations/:invId', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const revoked = await inviteService.revokeInvitation(req.params.invId);
  if (!revoked) return res.status(404).json({ error: 'Invitation not found' });
  res.json({ message: 'Invitation revoked' });
}));

// --- Token-based invitation endpoints (used by InviteAcceptPage) ---

workspaceRouter.get('/invitations/:token/info', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const result = await (await import('../utils/database-context')).queryPublic(`
    SELECT wi.email, wi.role, wi.expires_at, wi.accepted_at, wi.created_at,
           w.name AS workspace_name, w.icon AS workspace_icon,
           o.name AS org_name,
           u.display_name AS inviter_name, u.email AS inviter_email
    FROM public.workspace_invitations wi
    JOIN public.workspaces w ON w.id = wi.workspace_id
    JOIN public.organizations o ON o.id = w.org_id
    LEFT JOIN public.users u ON u.id = wi.invited_by
    WHERE wi.token = $1
  `, [token]);
  const inv = result.rows[0];
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });
  if (inv.accepted_at) return res.status(410).json({ error: 'Invitation already accepted' });
  if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: 'Invitation expired' });
  res.json({ data: inv });
}));

workspaceRouter.post('/invitations/:token/accept', asyncHandler(async (req, res) => {
  const userId = (req as any).jwtUser?.id || (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });
  const { token } = req.params;
  const member = await inviteService.acceptInvitation(token, userId);
  // Return workspaceId so frontend can switch
  res.json({ data: member, workspaceId: member.workspace_id });
}));

// --- Audit Log ---

workspaceRouter.get('/workspaces/:wsId/audit', requireWorkspaceRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { limit, offset, action } = req.query;
  const entries = await auditService.getAuditLog(req.params.wsId, {
    limit: limit ? parseInt(limit as string) : 50,
    offset: offset ? parseInt(offset as string) : 0,
    action: action as string,
  });
  res.json({ data: entries });
}));
