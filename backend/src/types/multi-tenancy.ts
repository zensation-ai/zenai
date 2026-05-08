// backend/src/types/multi-tenancy.ts

// OrgPlan — Master-Plan v2 (Sprint 1.1, 2026-04-16):
// Renamed 'team' → 'business' to match pricing-architecture (€59/Seat Business-Tier).
// Migration: see backend/sql/migrations/sprint_1_1_plan_business_rename.sql
export type OrgPlan = 'free' | 'personal' | 'pro' | 'business' | 'enterprise';
export type OrgRole = 'owner' | 'admin' | 'member';
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type BaseSchema = 'operations' | 'finance' | 'people' | 'strategy';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  owner_id: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  sso_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  ai_persona: Record<string, unknown>;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceContext {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  base_schema: BaseSchema;
  icon: string | null;
  color: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface OrganizationMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  invited_by: string | null;
  joined_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface OrganizationInvitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface InviteOrgMemberInput {
  orgId: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
}

export interface WorkspaceDelegation {
  id: string;
  workspace_id: string;
  permission: string;
  delegator_id: string;
  delegate_id: string;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
}

export interface WorkspaceCredits {
  workspace_id: string;
  plan: OrgPlan;
  credits_limit: number;
  credits_used: number;
  seat_limit: number;
  seat_count: number;
  period_start: string;
  period_end: string;
  updated_at: string;
}

export interface CreditUsageEntry {
  id: number;
  workspace_id: string;
  user_id: string;
  action_type: string;
  credits_spent: number;
  model_used: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RACITag {
  responsible: string;
  accountable: string;
  consulted?: string[];
  informed?: string[];
}

export interface TenantAuditEntry {
  id: number;
  workspace_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  raci: RACITag;
  metadata: Record<string, unknown>;
  prev_hash: string | null;
  entry_hash: string;
  created_at: string;
}

export interface CreateOrgInput {
  name: string;
  ownerId: string;
  plan?: OrgPlan;
}

export interface CreateOrgResult {
  org: Organization;
  workspace: Workspace;
  contexts: WorkspaceContext[];
}

export interface CreateWorkspaceInput {
  orgId: string;
  name: string;
  icon?: string;
  color?: string;
  createdBy: string;
}

export interface CreateContextInput {
  workspaceId: string;
  name: string;
  baseSchema: BaseSchema;
  icon?: string;
  color?: string;
}

export interface InviteMemberInput {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string;
}

// Plan limits for validation
// Master-Plan v2 (Sprint 1.1, 2026-04-16):
//   - business renamed from team
//   - Business credits raised to 5000 (was 1500) so Business > Pro per pricing-tier rationale
export const PLAN_LIMITS: Record<OrgPlan, {
  maxWorkspaces: number;
  maxContextsPerWorkspace: number;
  maxSeats: number;
  creditsPerMonth: number;
}> = {
  free:       { maxWorkspaces: 1,  maxContextsPerWorkspace: 4,  maxSeats: 1,        creditsPerMonth: 50 },
  personal:   { maxWorkspaces: 2,  maxContextsPerWorkspace: 4,  maxSeats: 1,        creditsPerMonth: 500 },
  pro:        { maxWorkspaces: 5,  maxContextsPerWorkspace: 8,  maxSeats: 10,       creditsPerMonth: 2000 },
  business:   { maxWorkspaces: 20, maxContextsPerWorkspace: 999, maxSeats: 999,     creditsPerMonth: 5000 },
  enterprise: { maxWorkspaces: 999, maxContextsPerWorkspace: 999, maxSeats: 999999, creditsPerMonth: 999999 },
};

export const DEFAULT_CONTEXTS: Array<{ name: string; slug: string; baseSchema: BaseSchema; sortOrder: number }> = [
  { name: 'Operations', slug: 'operations', baseSchema: 'operations', sortOrder: 1 },
  { name: 'Finance',    slug: 'finance',    baseSchema: 'finance',    sortOrder: 2 },
  { name: 'People',     slug: 'people',     baseSchema: 'people',     sortOrder: 3 },
  { name: 'Strategy',   slug: 'strategy',   baseSchema: 'strategy',   sortOrder: 4 },
];
