/**
 * Multi-Tenancy Types — Phase B (Frontend UX)
 *
 * Three-level hierarchy: Organization > Workspace > Context
 * Mirrors backend data model from phase_multi_tenancy.sql
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  owner_id: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Sprint 1.1 (2026-04-16):
//   - 'team' → 'business' (matches Master-Plan v2 pricing)
//   - 'operations' → 'personal' (was Frontend-only divergence vs. Backend)
export type OrgPlan = 'free' | 'personal' | 'pro' | 'business' | 'enterprise';

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
  base_schema: 'operations' | 'finance' | 'people' | 'strategy';
  icon: string | null;
  color: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export type OrgRole = 'owner' | 'admin' | 'member';
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface WorkspaceMember {
  user_id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  role: WorkspaceRole;
  joined_at: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  invited_by_name?: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface InviteInfo {
  workspace_name: string;
  workspace_icon: string | null;
  org_name: string;
  inviter_name: string;
  inviter_email: string;
  role: WorkspaceRole;
  expires_at: string;
}
