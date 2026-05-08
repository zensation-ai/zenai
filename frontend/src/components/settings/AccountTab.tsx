/**
 * AccountTab - Konto-Verwaltung (Password, MFA, Sessions)
 *
 * Extracted from SettingsDashboard for reuse in UserSettingsPage.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SkeletonLoader } from '../SkeletonLoader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SessionInfo {
  id: string;
  device_info: string;
  ip_address: string;
  last_active: string;
  created_at: string;
  is_current: boolean;
}

export function AccountTab() {
  const { user, getAccessToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || '';

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(user?.mfa_enabled ?? false);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qr_uri: string } | null>(null);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaMsg, setMfaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsMsg, setSessionsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getAccessToken]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/sessions`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  };

  // Password change
  const handlePasswordChange = async () => {
    setPasswordMsg(null);
    if (!currentPassword || !newPassword) {
      setPasswordMsg({ type: 'error', text: 'Bitte alle Felder ausfüllen.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Neue Passwörter stimmen nicht überein.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Mindestens 8 Zeichen erforderlich.' });
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMsg({ type: 'success', text: 'Passwort erfolgreich geändert.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMsg({ type: 'error', text: data.error || 'Fehler beim Ändern.' });
      }
    } catch {
      setPasswordMsg({ type: 'error', text: 'Netzwerkfehler.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // MFA enable
  const handleMfaEnable = async () => {
    setMfaMsg(null);
    setMfaLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/mfa/setup`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setMfaSetup(data.data);
      } else {
        setMfaMsg({ type: 'error', text: data.error || 'Fehler bei MFA-Aktivierung.' });
      }
    } catch {
      setMfaMsg({ type: 'error', text: 'Netzwerkfehler.' });
    } finally {
      setMfaLoading(false);
    }
  };

  // MFA verify
  const handleMfaVerify = async () => {
    setMfaMsg(null);
    if (!mfaToken || mfaToken.length !== 6) {
      setMfaMsg({ type: 'error', text: 'Bitte 6-stelligen Code eingeben.' });
      return;
    }
    setMfaLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/mfa/verify`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token: mfaToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setMfaEnabled(true);
        setMfaSetup(null);
        setMfaToken('');
        setMfaMsg({ type: 'success', text: 'MFA erfolgreich aktiviert.' });
      } else {
        setMfaMsg({ type: 'error', text: data.error || 'Ungültiger Code.' });
      }
    } catch {
      setMfaMsg({ type: 'error', text: 'Netzwerkfehler.' });
    } finally {
      setMfaLoading(false);
    }
  };

  // MFA disable
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [showMfaDisable, setShowMfaDisable] = useState(false);
  const handleMfaDisable = async () => {
    if (!showMfaDisable) { setShowMfaDisable(true); return; }
    const code = mfaDisableCode.trim();
    if (!code) return;
    setMfaMsg(null);
    setMfaLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/mfa/disable`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ token: code }),
      });
      const data = await res.json();
      if (res.ok) {
        setMfaEnabled(false);
        setShowMfaDisable(false);
        setMfaDisableCode('');
        setMfaMsg({ type: 'success', text: 'MFA deaktiviert.' });
      } else {
        setMfaMsg({ type: 'error', text: data.error || 'Fehler beim Deaktivieren.' });
      }
    } catch {
      setMfaMsg({ type: 'error', text: 'Netzwerkfehler.' });
    } finally {
      setMfaLoading(false);
    }
  };

  // Revoke session
  const handleRevokeSession = async (sessionId: string) => {
    setSessionsMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setSessionsMsg({ type: 'success', text: 'Session beendet.' });
      } else {
        setSessionsMsg({ type: 'error', text: 'Fehler beim Beenden der Session.' });
      }
    } catch {
      setSessionsMsg({ type: 'error', text: 'Netzwerkfehler.' });
    }
  };

  // Logout all
  const [showLogoutAllConfirm, setShowLogoutAllConfirm] = useState(false);
  const handleLogoutAll = async () => {
    if (!showLogoutAllConfirm) { setShowLogoutAllConfirm(true); return; }
    setShowLogoutAllConfirm(false);
    setSessionsMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/auth/logout-all`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        setSessionsMsg({ type: 'success', text: 'Alle Sessions beendet.' });
        setSessions([]);
      } else {
        setSessionsMsg({ type: 'error', text: 'Fehler.' });
      }
    } catch {
      setSessionsMsg({ type: 'error', text: 'Netzwerkfehler.' });
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Password Change */}
      <div className="glass rounded-lg border border-glass-border overflow-hidden">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">Passwort andern</h3>
        {passwordMsg && (
          <div className={cn(
            'px-3 py-2 rounded-md text-xs font-medium mx-5 my-2 border',
            passwordMsg.type === 'success'
              ? 'bg-green-500/10 text-green-500 border-green-500/25'
              : 'bg-red-500/10 text-red-500 border-red-500/25'
          )}>
            {passwordMsg.text}
          </div>
        )}
        <div className="flex flex-col items-stretch gap-3 px-5 py-3.5 border-t border-border/10">
          <div>
            <label className="text-xs font-medium text-text">Aktuelles Passwort</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Aktuelles Passwort"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text">Neues Passwort</label>
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Mindestens 8 Zeichen"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text">Neues Passwort bestätigen</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Passwort wiederholen"
              className="mt-1"
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePasswordChange}
              disabled={passwordLoading}
            >
              {passwordLoading ? 'Wird geändert...' : 'Passwort ändern'}
            </Button>
          </div>
        </div>
      </div>

      {/* MFA */}
      <div className="glass rounded-lg border border-glass-border overflow-hidden">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">Zwei-Faktor-Authentifizierung (MFA)</h3>
        {mfaMsg && (
          <div className={cn(
            'px-3 py-2 rounded-md text-xs font-medium mx-5 my-2 border',
            mfaMsg.type === 'success'
              ? 'bg-green-500/10 text-green-500 border-green-500/25'
              : 'bg-red-500/10 text-red-500 border-red-500/25'
          )}>
            {mfaMsg.text}
          </div>
        )}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-text">Status</span>
            <span className="text-xs text-text-secondary">
              {mfaEnabled ? 'MFA ist aktiviert' : 'MFA ist nicht aktiviert'}
            </span>
          </div>
          <span className={cn(
            'text-sm bg-surface-hover px-3 py-1 rounded-md',
            mfaEnabled ? 'text-green-500' : 'text-text-muted'
          )}>
            {mfaEnabled ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
        {!mfaEnabled && !mfaSetup && (
          <div className="flex justify-end px-5 py-3.5 border-t border-border/10">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMfaEnable}
              disabled={mfaLoading}
            >
              {mfaLoading ? 'Wird vorbereitet...' : 'MFA aktivieren'}
            </Button>
          </div>
        )}
        {mfaSetup && (
          <div className="flex flex-col items-stretch gap-3 px-5 py-3.5 border-t border-border/10">
            <div className="text-center">
              <p className="text-xs text-text-secondary mb-2">
                Scanne den QR-Code mit deiner Authenticator-App oder gib den Schluessel manuell ein:
              </p>
              {mfaSetup.qr_uri && (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaSetup.qr_uri)}`}
                  alt="MFA QR Code"
                  className="w-[200px] h-[200px] rounded-md mx-auto my-2 block"
                />
              )}
              <code className="inline-block px-3 py-1.5 bg-surface-hover rounded-md text-xs tracking-widest break-all">
                {mfaSetup.secret}
              </code>
            </div>
            <div>
              <label className="text-xs font-medium text-text">Verifizierungscode (6 Stellen)</label>
              <Input
                type="text"
                value={mfaToken}
                onChange={e => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 text-center tracking-[0.3em] text-lg"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setMfaSetup(null); setMfaToken(''); }}
              >
                Abbrechen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMfaVerify}
                disabled={mfaLoading || mfaToken.length !== 6}
                className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20"
              >
                {mfaLoading ? 'Wird verifiziert...' : 'Verifizieren & aktivieren'}
              </Button>
            </div>
          </div>
        )}
        {mfaEnabled && (
          <div className="flex flex-col items-end gap-2 px-5 py-3.5 border-t border-border/10">
            {showMfaDisable && (
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  value={mfaDisableCode}
                  onChange={e => setMfaDisableCode(e.target.value)}
                  placeholder="TOTP-Code"
                  className="w-[120px]"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleMfaDisable(); if (e.key === 'Escape') { setShowMfaDisable(false); setMfaDisableCode(''); } }}
                />
                <Button variant="outline" size="sm" onClick={() => { setShowMfaDisable(false); setMfaDisableCode(''); }}>Abbrechen</Button>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleMfaDisable}
              disabled={mfaLoading}
              className="border-red-500/30"
            >
              {showMfaDisable ? 'Bestatigen' : 'MFA deaktivieren'}
            </Button>
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="glass rounded-lg border border-glass-border overflow-hidden">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">Aktive Sessions</h3>
        {sessionsMsg && (
          <div className={cn(
            'px-3 py-2 rounded-md text-xs font-medium mx-5 my-2 border',
            sessionsMsg.type === 'success'
              ? 'bg-green-500/10 text-green-500 border-green-500/25'
              : 'bg-red-500/10 text-red-500 border-red-500/25'
          )}>
            {sessionsMsg.text}
          </div>
        )}
        {sessionsLoading ? (
          <div className="px-5 py-4">
            <SkeletonLoader type="text" count={3} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-5 py-3.5 border-t border-border/10">
            <span className="text-xs text-text-secondary">Keine aktiven Sessions gefunden.</span>
          </div>
        ) : (
          <>
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-sm font-medium text-text flex items-center gap-1.5">
                    {s.device_info || 'Unbekanntes Gerat'}
                    {s.is_current && (
                      <span className="text-[0.65rem] px-1.5 py-0.5 rounded-sm bg-green-500/15 text-green-500 font-semibold">
                        Aktuell
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-text-secondary">
                    IP: {s.ip_address || '---'} &middot; Zuletzt aktiv: {formatDate(s.last_active || s.created_at)}
                  </span>
                </div>
                {!s.is_current && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleRevokeSession(s.id)}
                    className="border-red-500/30"
                  >
                    Beenden
                  </Button>
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border/10">
              {showLogoutAllConfirm && (
                <>
                  <span className="text-sm text-text-secondary">Alle Sessions beenden?</span>
                  <Button variant="outline" size="sm" onClick={() => setShowLogoutAllConfirm(false)}>Abbrechen</Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogoutAll}
                className="border-red-500/30"
              >
                {showLogoutAllConfirm ? 'Ja, alle abmelden' : 'Alle abmelden'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
