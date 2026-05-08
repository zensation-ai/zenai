// backend/src/services/workspace-invitation-service.ts
import crypto from 'crypto';
import { queryPublic } from '../utils/database-context';
import type { WorkspaceInvitation, WorkspaceMember, InviteMemberInput } from '../types/multi-tenancy';

export async function createInvitation(input: InviteMemberInput): Promise<WorkspaceInvitation> {
  const token = crypto.randomBytes(32).toString('hex'); // 64 chars

  const result = await queryPublic(`
    INSERT INTO public.workspace_invitations (workspace_id, email, role, invited_by, token)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [input.workspaceId, input.email.toLowerCase(), input.role, input.invitedBy, token]);

  return result.rows[0];
}

export async function acceptInvitation(token: string, userId: string): Promise<WorkspaceMember> {
  // 1. Find invitation
  const invResult = await queryPublic(
    'SELECT * FROM public.workspace_invitations WHERE token = $1',
    [token]
  );
  const invitation = invResult.rows[0];
  if (!invitation) throw new Error('Invitation not found');
  if (invitation.accepted_at) throw new Error('Invitation already accepted');
  if (new Date(invitation.expires_at) < new Date()) throw new Error('Invitation has expired');

  // 2. Mark as accepted
  await queryPublic(
    'UPDATE public.workspace_invitations SET accepted_at = now() WHERE id = $1',
    [invitation.id]
  );

  // 3. Add as workspace member
  const memberResult = await queryPublic(
    `INSERT INTO public.workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3
     RETURNING *`,
    [invitation.workspace_id, userId, invitation.role]
  );

  // 4. Also add as org member if not already
  await queryPublic(`
    INSERT INTO public.organization_members (org_id, user_id, role, invited_by)
    SELECT w.org_id, $1, 'member', $2
    FROM public.workspaces w WHERE w.id = $3
    ON CONFLICT DO NOTHING
  `, [userId, invitation.invited_by, invitation.workspace_id]);

  return memberResult.rows[0];
}

export async function listPendingInvitations(wsId: string): Promise<WorkspaceInvitation[]> {
  const result = await queryPublic(
    `SELECT * FROM public.workspace_invitations
     WHERE workspace_id = $1 AND accepted_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC`,
    [wsId]
  );
  return result.rows;
}

export async function sendInvitationEmail(invitation: WorkspaceInvitation, wsId: string): Promise<void> {
  // Only send if Resend is configured
  if (!process.env.RESEND_API_KEY) return;

  const wsResult = await queryPublic(
    `SELECT w.name AS ws_name, o.name AS org_name
     FROM public.workspaces w JOIN public.organizations o ON o.id = w.org_id
     WHERE w.id = $1`,
    [wsId],
  );
  const ws = wsResult.rows[0];
  if (!ws) return;

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const inviteUrl = `${appUrl}/invite/${invitation.token}`;

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'ZenAI <noreply@zensation.ai>',
    to: invitation.email,
    subject: `Einladung: ${ws.ws_name} (${ws.org_name})`,
    html: `<p>Du wurdest in den Workspace <strong>${ws.ws_name}</strong> eingeladen.</p>
           <p><a href="${inviteUrl}">Einladung annehmen →</a></p>
           <p>Der Link ist gültig bis ${new Date(invitation.expires_at).toLocaleDateString('de-DE')}.</p>`,
  });
}

export async function revokeInvitation(invitationId: string): Promise<boolean> {
  const result = await queryPublic(
    'DELETE FROM public.workspace_invitations WHERE id = $1 RETURNING id',
    [invitationId]
  );
  return result.rows.length > 0;
}
