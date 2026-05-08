/**
 * React Query hooks for Organization Member Management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { queryKeys } from '../../lib/query-keys';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type OrgRole = 'owner' | 'admin' | 'member';

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  invited_by: string | null;
  joined_at: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface OrgInvitation {
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

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.organizations.members(orgId ?? ''),
    queryFn: async () => {
      const { data } = await axios.get(`/api/organizations/${orgId}/members`);
      return data.data as OrgMember[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

export function useOrgInvitations(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.organizations.invitations(orgId ?? ''),
    queryFn: async () => {
      const { data } = await axios.get(`/api/organizations/${orgId}/invitations`);
      return data.data as OrgInvitation[];
    },
    enabled: !!orgId,
    staleTime: 30 * 1000, // 30s
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

export function useAddOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; role?: OrgRole }) => {
      const { data } = await axios.post(`/api/organizations/${orgId}/members`, input);
      return data.data as OrgMember;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
    },
  });
}

export function useUpdateOrgMemberRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: OrgRole }) => {
      const { data } = await axios.put(
        `/api/organizations/${orgId}/members/${input.userId}`,
        { role: input.role }
      );
      return data.data as OrgMember;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
    },
  });
}

export function useRemoveOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await axios.delete(`/api/organizations/${orgId}/members/${userId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
    },
  });
}

export function useTransferOrgOwnership(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newOwnerId: string) => {
      await axios.post(`/api/organizations/${orgId}/transfer`, { new_owner_id: newOwnerId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.organizations.members(orgId) });
      qc.invalidateQueries({ queryKey: queryKeys.organizations.detail('', orgId) });
    },
  });
}

export function useInviteOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role?: OrgRole }) => {
      const { data } = await axios.post(`/api/organizations/${orgId}/invite`, input);
      return data.data as OrgInvitation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.organizations.invitations(orgId) });
    },
  });
}

export function useRevokeOrgInvitation(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      await axios.delete(`/api/organizations/${orgId}/invitations/${invitationId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.organizations.invitations(orgId) });
    },
  });
}
