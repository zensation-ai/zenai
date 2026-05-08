import { queryPublic } from '../utils/database-context';
import type {
  Organization, OrganizationMember, Workspace, WorkspaceContext,
  CreateOrgInput, CreateOrgResult, OrgRole,
} from '../types/multi-tenancy';
import { PLAN_LIMITS as planLimits } from '../types/multi-tenancy';

/**
 * Generate URL-safe slug from organization name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äö]/g, m => ({ 'ä': 'ae', 'ö': 'oe' }[m] || m))
    .replace(/[ü]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Create organization with default workspace, 4 contexts, owner memberships, and credits.
 * Uses a single CTE query for atomicity.
 */
export async function createOrganization(input: CreateOrgInput): Promise<CreateOrgResult> {
  const slug = generateSlug(input.name);
  const plan = input.plan || 'free';
  const limits = planLimits[plan];

  try {
    const result = await queryPublic(`
      WITH new_org AS (
        INSERT INTO public.organizations (name, slug, plan, owner_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      ), new_org_member AS (
        INSERT INTO public.organization_members (org_id, user_id, role)
        SELECT id, $4, 'owner' FROM new_org
        RETURNING *
      ), new_ws AS (
        INSERT INTO public.workspaces (org_id, name, slug, color)
        SELECT id, 'Default', 'default', '#6366f1' FROM new_org
        RETURNING *
      ), new_ws_member AS (
        INSERT INTO public.workspace_members (workspace_id, user_id, role)
        SELECT id, $4, 'owner' FROM new_ws
        RETURNING *
      ), new_contexts AS (
        INSERT INTO public.workspace_contexts (workspace_id, name, slug, base_schema, sort_order)
        SELECT ws.id, ctx.name, ctx.slug, ctx.base_schema, ctx.sort_order
        FROM new_ws ws
        CROSS JOIN (VALUES
          ('Operations', 'operations', 'operations', 1),
          ('Finance', 'finance', 'finance', 2),
          ('People', 'people', 'people', 3),
          ('Strategy', 'strategy', 'strategy', 4)
        ) AS ctx(name, slug, base_schema, sort_order)
        RETURNING *
      ), new_credits AS (
        INSERT INTO public.workspace_credits (workspace_id, plan, credits_limit, seat_limit)
        SELECT id, $3, $5, $6 FROM new_ws
        RETURNING *
      )
      SELECT
        row_to_json(o.*) AS org,
        row_to_json(w.*) AS workspace,
        json_agg(c.*) AS contexts
      FROM new_org o, new_ws w, new_contexts c
      GROUP BY o.id, o.name, o.slug, o.plan, o.owner_id, o.logo_url,
               o.settings, o.sso_config, o.created_at, o.updated_at,
               w.id, w.org_id, w.name, w.slug, w.icon, w.color,
               w.ai_persona, w.settings, w.created_at, w.updated_at
    `, [input.name, slug, plan, input.ownerId, limits.creditsPerMonth, limits.maxSeats]);

    const row = result.rows[0];
    return {
      org: row.org as Organization,
      workspace: row.workspace as Workspace,
      contexts: (typeof row.contexts === 'string' ? JSON.parse(row.contexts) : row.contexts) as WorkspaceContext[],
    };
  } catch (err: any) {
    if (err.code === '23505') {
      throw new Error('Organization slug already exists');
    }
    throw err;
  }
}

/**
 * Get organization by ID. Only returns if user is a member.
 */
export async function getOrganization(
  orgId: string, userId: string
): Promise<(Organization & { member_count: number; caller_role: string }) | null> {
  const result = await queryPublic(`
    SELECT o.*, om.role AS caller_role, COUNT(om2.user_id)::int AS member_count
    FROM public.organizations o
    JOIN public.organization_members om ON om.org_id = o.id AND om.user_id = $2
    LEFT JOIN public.organization_members om2 ON om2.org_id = o.id
    WHERE o.id = $1
    GROUP BY o.id, om.role
  `, [orgId, userId]);

  return result.rows[0] || null;
}

/**
 * List all organizations where user is a member.
 */
export async function listUserOrganizations(userId: string) {
  const result = await queryPublic(`
    SELECT o.*, om.role
    FROM public.organizations o
    JOIN public.organization_members om ON om.org_id = o.id
    WHERE om.user_id = $1
    ORDER BY o.created_at ASC
  `, [userId]);

  return result.rows;
}

/**
 * Update organization (name, settings, logo_url).
 */
export async function updateOrganization(
  orgId: string, updates: { name?: string; settings?: Record<string, unknown>; logo_url?: string }
): Promise<Organization | null> {
  const setClauses: string[] = ['updated_at = now()'];
  const params: any[] = [orgId];
  let idx = 2;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${idx}`);
    params.push(updates.name);
    idx++;
  }
  if (updates.settings !== undefined) {
    setClauses.push(`settings = $${idx}`);
    params.push(JSON.stringify(updates.settings));
    idx++;
  }
  if (updates.logo_url !== undefined) {
    setClauses.push(`logo_url = $${idx}`);
    params.push(updates.logo_url);
    idx++;
  }

  const result = await queryPublic(
    `UPDATE public.organizations SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Delete organization (cascades to workspaces, members, etc.).
 */
export async function deleteOrganization(orgId: string): Promise<boolean> {
  const result = await queryPublic(
    'DELETE FROM public.organizations WHERE id = $1 RETURNING id',
    [orgId]
  );
  return result.rows.length > 0;
}

// --- Organization Member Management ---

/**
 * List all members of an organization with user details.
 */
export async function listMembers(orgId: string) {
  const result = await queryPublic(`
    SELECT om.*, u.email, u.display_name, u.avatar_url
    FROM public.organization_members om
    JOIN public.users u ON u.id = om.user_id
    WHERE om.org_id = $1
    ORDER BY om.joined_at ASC
  `, [orgId]);
  return result.rows;
}

/**
 * Add or update a member in the organization.
 */
export async function addMember(
  orgId: string, userId: string, role: OrgRole, invitedBy?: string
): Promise<OrganizationMember> {
  const result = await queryPublic(
    `INSERT INTO public.organization_members (org_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = $3
     RETURNING *`,
    [orgId, userId, role, invitedBy || null]
  );
  return result.rows[0];
}

/**
 * Update a member's role. Cannot change the owner role directly — use transferOwnership.
 */
export async function updateMemberRole(
  orgId: string, userId: string, newRole: OrgRole
): Promise<OrganizationMember | null> {
  const current = await queryPublic(
    'SELECT role FROM public.organization_members WHERE org_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  if (!current.rows[0]) return null;
  if (current.rows[0].role === 'owner') {
    throw new Error('Cannot change owner role directly. Use transferOwnership.');
  }

  const result = await queryPublic(
    'UPDATE public.organization_members SET role = $3 WHERE org_id = $1 AND user_id = $2 RETURNING *',
    [orgId, userId, newRole]
  );
  return result.rows[0] || null;
}

/**
 * Remove a member from the organization. Cannot remove the owner.
 */
export async function removeMember(orgId: string, userId: string): Promise<boolean> {
  const current = await queryPublic(
    'SELECT role FROM public.organization_members WHERE org_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  if (current.rows[0]?.role === 'owner') {
    throw new Error('Cannot remove organization owner. Transfer ownership first.');
  }

  const result = await queryPublic(
    'DELETE FROM public.organization_members WHERE org_id = $1 AND user_id = $2 RETURNING user_id',
    [orgId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Transfer org ownership atomically: demote current owner to admin, promote new owner.
 */
export async function transferOwnership(
  orgId: string, currentOwnerId: string, newOwnerId: string
): Promise<void> {
  // Verify new owner is a member
  const member = await queryPublic(
    'SELECT * FROM public.organization_members WHERE org_id = $1 AND user_id = $2',
    [orgId, newOwnerId]
  );
  if (!member.rows[0]) {
    throw new Error('New owner must be an organization member');
  }

  await queryPublic(`
    WITH demote AS (
      UPDATE public.organization_members SET role = 'admin'
      WHERE org_id = $1 AND user_id = $2
    ), promote AS (
      UPDATE public.organization_members SET role = 'owner'
      WHERE org_id = $1 AND user_id = $3
    )
    UPDATE public.organizations SET owner_id = $3 WHERE id = $1
  `, [orgId, currentOwnerId, newOwnerId]);
}
