/**
 * InviteAcceptPage — Accept workspace invitation via token
 *
 * Route: /invite/:token
 * Shows org/workspace name + inviter, accept/decline buttons.
 * Redirects to workspace on accept.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { SparkLogo } from './layout/SparkLogo';
import { useAuth } from '../contexts/AuthContext';
import type { InviteInfo, WorkspaceRole } from '../types/multi-tenancy';

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Mitglied',
  viewer: 'Betrachter',
};

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
}

export function InviteAcceptPage() {
  // Extract token from URL — works both with and without React Router <Route>
  const params = useParams<{ token: string }>();
  const location = window.location.pathname;
  const token = params.token || location.split('/invite/')[1] || undefined;
  const navigate = useNavigate();
  const { session, getAccessToken, switchWorkspace, refreshOrgs } = useAuth();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Fetch invite info on mount
  useEffect(() => {
    if (!token) {
      setError('Ungültiger Einladungslink');
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/invitations/${token}/info`);
        if (res.ok) {
          const data = await res.json();
          setInviteInfo(data.data ?? data);
        } else if (res.status === 404) {
          setError('Einladung nicht gefunden oder abgelaufen');
        } else {
          setError('Fehler beim Laden der Einladung');
        }
      } catch {
        setError('Verbindungsfehler');
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const authToken = getAccessToken();
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      // Find workspace ID from invite info — the join endpoint is on the workspace
      const res = await fetch(`${getApiUrl()}/api/invitations/${token}/accept`, {
        method: 'POST',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        setAccepted(true);
        // Refresh orgs list and switch to the new workspace
        await refreshOrgs();
        if (data.workspaceId) {
          await switchWorkspace(data.workspaceId);
        }
        // Redirect to home after short delay
        setTimeout(() => navigate('/'), 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Einladung konnte nicht angenommen werden');
      }
    } catch {
      setError('Verbindungsfehler');
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    navigate('/');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-primary animate-spin" />
          <span className="text-sm text-text-muted">Einladung wird geladen...</span>
        </div>
      </div>
    );
  }

  // Error state (no invite info)
  if (error && !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-full max-w-md mx-4 p-8 bg-bg-secondary border border-border rounded-xl text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-text mb-2">Einladung ungültig</h1>
          <p className="text-sm text-text-muted mb-6">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 py-2 rounded-lg bg-surface border border-border text-text text-sm font-medium cursor-pointer hover:bg-surface-hover transition-colors"
          >
            Zur Startseite
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-full max-w-md mx-4 p-8 bg-bg-secondary border border-border rounded-xl text-center">
          <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-lg font-bold text-text mb-2">Willkommen im Team!</h1>
          <p className="text-sm text-text-muted">
            Du bist jetzt Mitglied von <strong className="text-text">{inviteInfo?.workspace_name}</strong>.
            Du wirst gleich weitergeleitet...
          </p>
        </div>
      </div>
    );
  }

  // Invite details
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-full max-w-md mx-4 p-8 bg-bg-secondary border border-border rounded-xl">
        <div className="flex flex-col items-center mb-6">
          <SparkLogo size={40} variant="dark" />
          <h1 className="text-lg font-bold text-text mt-3">Workspace-Einladung</h1>
        </div>

        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="size-16 rounded-xl bg-surface flex items-center justify-center">
            {inviteInfo?.workspace_icon ? (
              <span className="text-3xl">{inviteInfo.workspace_icon}</span>
            ) : (
              <Users size={28} className="text-primary" />
            )}
          </div>

          <div className="text-center">
            <p className="text-base font-semibold text-text">{inviteInfo?.workspace_name}</p>
            <p className="text-xs text-text-muted">{inviteInfo?.org_name}</p>
          </div>

          <div className="w-full px-4 py-3 bg-surface rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-muted">Eingeladen von</span>
              <span className="text-text font-medium">{inviteInfo?.inviter_name || inviteInfo?.inviter_email}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-2">
              <span className="text-text-muted">Rolle</span>
              <span className="text-text font-medium">{ROLE_LABELS[inviteInfo?.role ?? 'member']}</span>
            </div>
            {inviteInfo?.expires_at && (
              <div className="flex justify-between items-center text-sm mt-2">
                <span className="text-text-muted">Gültig bis</span>
                <span className="text-text font-medium">
                  {new Date(inviteInfo.expires_at).toLocaleDateString('de-DE')}
                </span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-red-500/10 text-red-400 text-xs">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {!session && (
          <div className="px-3 py-2 mb-4 rounded-lg bg-amber-500/10 text-amber-400 text-xs text-center">
            Du musst angemeldet sein, um die Einladung anzunehmen.
            <button
              type="button"
              onClick={() => navigate(`/auth?redirect=/invite/${token}`)}
              className="ml-1 underline font-medium bg-transparent border-none text-amber-400 cursor-pointer"
            >
              Anmelden
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDecline}
            className="flex-1 py-2.5 rounded-lg border border-border bg-surface text-text text-sm font-medium cursor-pointer hover:bg-surface-hover transition-colors"
          >
            <X size={14} className="inline mr-1.5 -mt-0.5" />
            Ablehnen
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting || !session}
            className="flex-1 py-2.5 rounded-lg border-none bg-primary text-white text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {accepting ? (
              <Loader2 size={14} className="inline mr-1.5 -mt-0.5 animate-spin" />
            ) : (
              <Check size={14} className="inline mr-1.5 -mt-0.5" />
            )}
            Annehmen
          </button>
        </div>
      </div>
    </div>
  );
}

export default InviteAcceptPage;
