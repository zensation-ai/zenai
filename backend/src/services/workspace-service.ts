import { queryPublic } from '../utils/database-context';
import { generateSlug } from './organization-service';
import type {
  Workspace, WorkspaceContext, WorkspaceMember,
  CreateWorkspaceInput, CreateContextInput, BaseSchema,
} from '../types/multi-tenancy';
import { PLAN_LIMITS, DEFAULT_CONTEXTS } from '../types/multi-tenancy';

// --- Workspace CRUD ---

export async function createWorkspace(input: CreateWorkspaceInput) {
  // 1. Verify user is org owner/admin
  const memberCheck = await queryPublic(
    `SELECT om.role, o.plan FROM public.organization_members om
     JOIN public.organizations o ON o.id = om.org_id
     WHERE om.org_id = $1 AND om.user_id = $2`,
    [input.orgId, input.createdBy]
  );
  const member = memberCheck.rows[0];
  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new Error('Only org owner or admin can create workspaces');
  }

  // 2. Check workspace count against plan
  const countResult = await queryPublic(
    'SELECT COUNT(*)::int AS count FROM public.workspaces WHERE org_id = $1',
    [input.orgId]
  );
  const limits = PLAN_LIMITS[member.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
  if (parseInt(countResult.rows[0].count) >= limits.maxWorkspaces) {
    throw new Error('Workspace limit reached for current plan');
  }

  // 3. Create workspace + owner member + default contexts via CTE
  const slug = generateSlug(input.name);
  const result = await queryPublic(`
    WITH new_ws AS (
      INSERT INTO public.workspaces (org_id, name, slug, icon, color)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    ), new_ws_member AS (
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      SELECT id, $6, 'owner' FROM new_ws
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
      SELECT id, $7, $8, $9 FROM new_ws
      RETURNING *
    )
    SELECT
      row_to_json(w.*) AS workspace,
      json_agg(c.*) AS contexts
    FROM new_ws w, new_contexts c
    GROUP BY w.id, w.org_id, w.name, w.slug, w.icon, w.color,
             w.ai_persona, w.settings, w.created_at, w.updated_at
  `, [
    input.orgId, input.name, slug, input.icon || null, input.color || null,
    input.createdBy, member.plan, limits.creditsPerMonth, limits.maxSeats,
  ]);

  const row = result.rows[0];
  return {
    workspace: row.workspace as Workspace,
    contexts: (typeof row.contexts === 'string' ? JSON.parse(row.contexts) : row.contexts) as WorkspaceContext[],
  };
}

export async function getWorkspace(wsId: string) {
  const result = await queryPublic(`
    SELECT w.*, COUNT(wm.user_id)::int AS member_count
    FROM public.workspaces w
    LEFT JOIN public.workspace_members wm ON wm.workspace_id = w.id
    WHERE w.id = $1
    GROUP BY w.id
  `, [wsId]);
  return result.rows[0] || null;
}

export async function listOrgWorkspaces(orgId: string) {
  const result = await queryPublic(
    'SELECT * FROM public.workspaces WHERE org_id = $1 ORDER BY created_at ASC',
    [orgId]
  );
  return result.rows;
}

export async function updateWorkspace(
  wsId: string, updates: { name?: string; icon?: string; color?: string; settings?: Record<string, unknown>; ai_persona?: Record<string, unknown> }
) {
  const ALLOWED_KEYS = ['name', 'icon', 'color', 'settings', 'ai_persona'];
  const setClauses: string[] = ['updated_at = now()'];
  const params: any[] = [wsId];
  let idx = 2;

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined && ALLOWED_KEYS.includes(key)) {
      setClauses.push(`${key} = $${idx}`);
      params.push(typeof val === 'object' ? JSON.stringify(val) : val);
      idx++;
    }
  }

  const result = await queryPublic(
    `UPDATE public.workspaces SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function deleteWorkspace(wsId: string): Promise<boolean> {
  const result = await queryPublic(
    'DELETE FROM public.workspaces WHERE id = $1 RETURNING id', [wsId]
  );
  return result.rows.length > 0;
}

// --- Context Management ---

export async function createContext(input: CreateContextInput): Promise<WorkspaceContext> {
  const countResult = await queryPublic(
    'SELECT COUNT(*)::int AS count FROM public.workspace_contexts WHERE workspace_id = $1 AND archived_at IS NULL',
    [input.workspaceId]
  );

  // Get plan from workspace → org
  const planResult = await queryPublic(
    `SELECT o.plan FROM public.workspaces w
     JOIN public.organizations o ON o.id = w.org_id
     WHERE w.id = $1`, [input.workspaceId]
  );
  const plan = planResult.rows[0]?.plan || 'free';
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;

  if (parseInt(countResult.rows[0].count) >= limits.maxContextsPerWorkspace) {
    throw new Error('Context limit reached for current plan');
  }

  const slug = generateSlug(input.name);
  const maxSort = await queryPublic(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM public.workspace_contexts WHERE workspace_id = $1',
    [input.workspaceId]
  );

  const result = await queryPublic(`
    INSERT INTO public.workspace_contexts (workspace_id, name, slug, base_schema, icon, color, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [input.workspaceId, input.name, slug, input.baseSchema, input.icon || null, input.color || null, maxSort.rows[0].next]);

  return result.rows[0];
}

export async function listContexts(wsId: string): Promise<WorkspaceContext[]> {
  const result = await queryPublic(
    'SELECT * FROM public.workspace_contexts WHERE workspace_id = $1 AND archived_at IS NULL ORDER BY sort_order ASC',
    [wsId]
  );
  return result.rows;
}

export async function getWorkspaceContext(wsId: string, slug: string): Promise<WorkspaceContext | null> {
  const result = await queryPublic(
    'SELECT * FROM public.workspace_contexts WHERE workspace_id = $1 AND slug = $2 AND archived_at IS NULL',
    [wsId, slug]
  );
  return result.rows[0] || null;
}

// --- Member Management ---

export async function listMembers(wsId: string) {
  const result = await queryPublic(`
    SELECT wm.*, u.email, u.display_name, u.avatar_url
    FROM public.workspace_members wm
    JOIN public.users u ON u.id = wm.user_id
    WHERE wm.workspace_id = $1
    ORDER BY wm.joined_at ASC
  `, [wsId]);
  return result.rows;
}

export async function addMember(wsId: string, userId: string, role: string): Promise<WorkspaceMember> {
  const result = await queryPublic(
    `INSERT INTO public.workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3
     RETURNING *`,
    [wsId, userId, role]
  );
  return result.rows[0];
}

export async function updateMemberRole(wsId: string, userId: string, newRole: string) {
  // Prevent changing owner role
  const current = await queryPublic(
    'SELECT role FROM public.workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [wsId, userId]
  );
  if (current.rows[0]?.role === 'owner') {
    throw new Error('Cannot change owner role directly. Use transferOwnership.');
  }

  const result = await queryPublic(
    'UPDATE public.workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2 RETURNING *',
    [wsId, userId, newRole]
  );
  return result.rows[0] || null;
}

export async function removeMember(wsId: string, userId: string): Promise<boolean> {
  const current = await queryPublic(
    'SELECT role FROM public.workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [wsId, userId]
  );
  if (current.rows[0]?.role === 'owner') {
    throw new Error('Cannot remove workspace owner. Transfer ownership first.');
  }

  const result = await queryPublic(
    'DELETE FROM public.workspace_members WHERE workspace_id = $1 AND user_id = $2 RETURNING user_id',
    [wsId, userId]
  );
  return result.rows.length > 0;
}

export async function transferOwnership(wsId: string, currentOwnerId: string, newOwnerId: string): Promise<void> {
  // Verify new owner is a member before transferring
  const member = await checkMembership(wsId, newOwnerId);
  if (!member) {
    throw new Error('New owner must be a workspace member');
  }
  // Atomic: demote current owner + promote new owner in a single CTE
  await queryPublic(`
    WITH demote AS (
      UPDATE public.workspace_members SET role = 'admin'
      WHERE workspace_id = $1 AND user_id = $2
    )
    UPDATE public.workspace_members SET role = 'owner'
    WHERE workspace_id = $1 AND user_id = $3
  `, [wsId, currentOwnerId, newOwnerId]);
}

/**
 * Check if user has required role in workspace.
 * Returns the member record or null.
 */
export async function checkMembership(wsId: string, userId: string): Promise<WorkspaceMember | null> {
  const result = await queryPublic(
    'SELECT * FROM public.workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [wsId, userId]
  );
  return result.rows[0] || null;
}
