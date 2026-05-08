/**
 * TeamTab — Workspace Members, Roles & Invitations
 *
 * Shown in AdminSettingsPage. Only visible for owner/admin roles.
 * Features: member list with role badges, invite form, pending invitations.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Shield, Crown, Eye, Users, Trash2, Mail } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { queryKeys } from '../../lib/query-keys';
import { cn } from '@/lib/utils';
import type { WorkspaceMember, WorkspaceInvitation, WorkspaceRole } from '../../types/multi-tenancy';

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-400' },
  admin: { label: 'Admin', icon: Shield, color: 'text-blue-400' },
  member: { label: 'Mitglied', icon: Users, color: 'text-emerald-400' },
  viewer: { label: 'Betrachter', icon: Eye, color: 'text-text-muted' },
};

export function TeamTab() {
  const { currentWorkspace, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const wsId = currentWorkspace?.id;

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAccessToken]);

  // Fetch members
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: queryKeys.workspace.members(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return [];
      const res = await axios.get(`/api/workspaces/${wsId}/members`, { headers: authHeaders() });
      return (res.data.data ?? res.data) as WorkspaceMember[];
    },
    enabled: !!wsId,
  });

  // Fetch pending invitations
  const { data: invitations = [] } = useQuery({
    queryKey: queryKeys.workspace.invitations(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return [];
      const res = await axios.get(`/api/workspaces/${wsId}/invitations`, { headers: authHeaders() });
      return (res.data.data ?? res.data) as WorkspaceInvitation[];
    },
    enabled: !!wsId,
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: WorkspaceRole }) => {
      const res = await axios.post(
        `/api/workspaces/${wsId}/invite`,
        { email, role },
        { headers: authHeaders() },
      );
      return res.data;
    },
    onSuccess: () => {
      setInviteEmail('');
      setInviteError(null);
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.invitations(wsId!) });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setInviteError(msg ?? 'Einladung fehlgeschlagen');
    },
  });

  // Remove member mutation
  const [memberError, setMemberError] = useState<string | null>(null);

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await axios.delete(`/api/workspaces/${wsId}/members/${userId}`, { headers: authHeaders() });
    },
    onSuccess: () => {
      setMemberError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.members(wsId!) });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setMemberError(msg ?? 'Aktion fehlgeschlagen');
    },
  });

  // Change role mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      await axios.put(
        `/api/workspaces/${wsId}/members/${userId}`,
        { role },
        { headers: authHeaders() },
      );
    },
    onSuccess: () => {
      setMemberError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.members(wsId!) });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setMemberError(msg ?? 'Rollenänderung fehlgeschlagen');
    },
  });

  // Revoke invitation mutation
  const revokeInviteMutation = useMutation({
    mutationFn: async (invId: string) => {
      await axios.delete(`/api/workspaces/${wsId}/invitations/${invId}`, { headers: authHeaders() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.invitations(wsId!) });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError(null);
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  if (!wsId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <Users size={48} className="mb-4 opacity-30" />
        <p className="text-sm">Kein Workspace aktiv. Erstelle oder wähle einen Workspace.</p>
      </div>
    );
  }

  const pendingInvitations = invitations.filter(inv => !inv.accepted_at);

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Invite Form */}
      <section>
        <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
          <UserPlus size={16} />
          Mitglied einladen
        </h3>
        <form onSubmit={handleInvite} className="flex gap-2 items-end">
          <div className="flex-1">
            <label htmlFor="invite-email" className="block text-xs text-text-muted mb-1">E-Mail</label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="block text-xs text-text-muted mb-1">Rolle</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as WorkspaceRole)}
              className="h-9 px-2 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-primary transition-colors"
            >
              <option value="member">Mitglied</option>
              <option value="admin">Admin</option>
              <option value="viewer">Betrachter</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviteMutation.isPending || !inviteEmail.trim()}
            className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium border-none cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {inviteMutation.isPending ? 'Senden...' : 'Einladen'}
          </button>
        </form>
        {inviteError && <p className="text-xs text-red-400 mt-1.5">{inviteError}</p>}
        {inviteSuccess && <p className="text-xs text-emerald-400 mt-1.5">Einladung gesendet!</p>}
      </section>

      {/* Members List */}
      <section>
        <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
          <Users size={16} />
          Mitglieder ({members.length})
        </h3>
        {memberError && <p className="text-xs text-red-400 mb-2" role="alert">{memberError}</p>}
        {membersLoading ? (
          <div className="text-xs text-text-muted py-4">Laden...</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {members.map((member, i) => {
              const roleConfig = ROLE_CONFIG[member.role];
              const RoleIcon = roleConfig.icon;
              return (
                <div
                  key={member.user_id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    i > 0 && 'border-t border-border',
                  )}
                >
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="size-8 rounded-full object-cover" />
                  ) : (
                    <div className="size-8 rounded-full bg-surface-hover flex items-center justify-center text-xs font-bold text-text-muted">
                      {(member.display_name || member.email)?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text truncate">
                      {member.display_name || member.email}
                    </div>
                    <div className="text-xs text-text-muted truncate">{member.email}</div>
                  </div>
                  <div className={cn('flex items-center gap-1 text-xs font-medium', roleConfig.color)}>
                    <RoleIcon size={12} />
                    {roleConfig.label}
                  </div>
                  {member.role !== 'owner' && (
                    <div className="flex items-center gap-1">
                      <select
                        value={member.role}
                        onChange={e => changeRoleMutation.mutate({ userId: member.user_id, role: e.target.value as WorkspaceRole })}
                        className="h-7 px-1.5 rounded border border-border bg-surface text-text text-xs outline-none"
                        aria-label={`Rolle von ${member.display_name || member.email} ändern`}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Mitglied</option>
                        <option value="viewer">Betrachter</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(member.user_id)}
                        className="size-7 flex items-center justify-center rounded border-none bg-transparent text-text-muted cursor-pointer hover:text-red-400 hover:bg-surface-hover transition-colors"
                        aria-label={`${member.display_name || member.email} entfernen`}
                        title="Entfernen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
            <Mail size={16} />
            Offene Einladungen ({pendingInvitations.length})
          </h3>
          <div className="border border-border rounded-lg overflow-hidden">
            {pendingInvitations.map((inv, i) => {
              const roleConfig = ROLE_CONFIG[inv.role];
              return (
                <div
                  key={inv.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    i > 0 && 'border-t border-border',
                  )}
                >
                  <div className="size-8 rounded-full bg-surface-hover flex items-center justify-center text-xs text-text-muted">
                    <Mail size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text truncate">{inv.email}</div>
                    <div className="text-xs text-text-muted">
                      Eingeladen am {new Date(inv.created_at).toLocaleDateString('de-DE')}
                      {inv.expires_at && <> · Gültig bis {new Date(inv.expires_at).toLocaleDateString('de-DE')}</>}
                    </div>
                  </div>
                  <span className={cn('text-xs font-medium', roleConfig.color)}>
                    {roleConfig.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => revokeInviteMutation.mutate(inv.id)}
                    className="size-7 flex items-center justify-center rounded border-none bg-transparent text-text-muted cursor-pointer hover:text-red-400 hover:bg-surface-hover transition-colors"
                    aria-label={`Einladung für ${inv.email} zurückziehen`}
                    title="Zurückziehen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default TeamTab;
