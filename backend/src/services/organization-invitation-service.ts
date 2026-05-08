// backend/src/services/organization-invitation-service.ts
import crypto from 'crypto';
import { queryPublic } from '../utils/database-context';
import type { OrganizationInvitation, OrganizationMember, InviteOrgMemberInput } from '../types/multi-tenancy';

export async function createInvitation(input: InviteOrgMemberInput): Promise<OrganizationInvitation> {
  const token = crypto.randomBytes(32).toString('hex'); // 64 chars

  const result = await queryPublic(`
    INSERT INTO public.organization_invitations (org_id, email, role, invited_by, token)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [input.orgId, input.email.toLowerCase(), input.role, input.invitedBy, token]);

  return result.rows[0];
}

export async function acceptInvitation(token: string, userId: string): Promise<OrganizationMember> {
  // 1. Find invitation
  const invResult = await queryPublic(
    'SELECT * FROM public.organization_invitations WHERE token = $1',
    [token]
  );
  const invitation = invResult.rows[0];
  if (!invitation) throw new Error('Invitation not found');
  if (invitation.accepted_at) throw new Error('Invitation already accepted');
  if (new Date(invitation.expires_at) < new Date()) throw new Error('Invitation has expired');

  // 2. Mark as accepted
  await queryPublic(
    'UPDATE public.organization_invitations SET accepted_at = now() WHERE id = $1',
    [invitation.id]
  );

  // 3. Add as org member
  const memberResult = await queryPublic(
    `INSERT INTO public.organization_members (org_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = $3
     RETURNING *`,
    [invitation.org_id, userId, invitation.role, invitation.invited_by]
  );

  return memberResult.rows[0];
}

export async function getInvitationInfo(token: string): Promise<(OrganizationInvitation & { org_name: string }) | null> {
  const result = await queryPublic(`
    SELECT oi.*, o.name AS org_name
    FROM public.organization_invitations oi
    JOIN public.organizations o ON o.id = oi.org_id
    WHERE oi.token = $1
  `, [token]);
  return result.rows[0] || null;
}

export async function listPendingInvitations(orgId: string): Promise<OrganizationInvitation[]> {
  const result = await queryPublic(
    `SELECT * FROM public.organization_invitations
     WHERE org_id = $1 AND accepted_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC`,
    [orgId]
  );
  return result.rows;
}

export async function sendInvitationEmail(invitation: OrganizationInvitation): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const orgResult = await queryPublic(
    'SELECT name FROM public.organizations WHERE id = $1',
    [invitation.org_id]
  );
  const orgName = orgResult.rows[0]?.name || 'Organization';

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const inviteUrl = `${appUrl}/invite/org/${invitation.token}`;

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'ZenAI <noreply@zensation.ai>',
    to: invitation.email,
    subject: `Einladung: ${orgName}`,
    html: `<p>Du wurdest in die Organisation <strong>${orgName}</strong> eingeladen.</p>
           <p><a href="${inviteUrl}">Einladung annehmen →</a></p>
           <p>Der Link ist gültig bis ${new Date(invitation.expires_at).toLocaleDateString('de-DE')}.</p>`,
  });
}

export async function revokeInvitation(invitationId: string): Promise<boolean> {
  const result = await queryPublic(
    'DELETE FROM public.organization_invitations WHERE id = $1 RETURNING id',
    [invitationId]
  );
  return result.rows.length > 0;
}
