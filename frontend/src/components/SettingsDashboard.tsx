/**
 * SettingsDashboard - Einstellungen (10 Tabs)
 *
 * Tabs:
 * - Profil: Benutzerprofil und Business-Profil
 * - Konto: Passwort, MFA, Sessions
 * - Allgemein: Erscheinungsbild, Sprache, Startseite
 * - KI: Modell-Präferenzen, Antwort-Stil, Tool-Einstellungen
 * - Datenschutz: Daten-Kontrolle, Löschen, Export-Hinweis
 * - Automationen: Workflows und AI-Vorschläge
 * - Governance: Genehmigungen, Audit-Trail, Richtlinien
 * - Integrationen: OAuth, API Keys, Webhooks
 * - MCP Server: Externe MCP-Verbindungen verwalten
 * - Daten: Export + Sync kombiniert
 */

import { memo, Suspense, lazy, useCallback, useState, useEffect } from 'react';
import { AIContext } from './ContextSwitcher';
import { HubPage, type TabDef } from './HubPage';
import { SkeletonLoader } from './SkeletonLoader';
import { useSettings } from '../hooks/useSettings';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { useAuth } from '../contexts/AuthContext';
import { FEATURE_HINTS, STORAGE_KEY_PREFIX } from '../constants/featureHints';
import type { Page } from '../types';
import '../neurodesign.css';
import './SettingsDashboard.css';

const ProfileDashboard = lazy(() => import('./ProfileDashboard').then(m => ({ default: m.ProfileDashboard })));
const AutomationDashboard = lazy(() => import('./AutomationDashboard').then(m => ({ default: m.AutomationDashboard })));
const IntegrationsPage = lazy(() => import('./IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const DataManagement = lazy(() => import('./DataManagement').then(m => ({ default: m.DataManagement })));
const MemoryGovernance = lazy(() => import('./MemoryGovernance').then(m => ({ default: m.MemoryGovernance })));
const GovernanceDashboard = lazy(() => import('./GovernanceDashboard').then(m => ({ default: m.GovernanceDashboard })));
const MCPConnectionsPage = lazy(() => import('./MCPConnectionsPage').then(m => ({ default: m.MCPConnectionsPage })));

type SettingsTab = 'profile' | 'account' | 'general' | 'ai' | 'privacy' | 'automations' | 'governance' | 'integrations' | 'mcp-servers' | 'data';

interface SettingsDashboardProps {
  context: AIContext;
  onBack: () => void;
  onNavigate: (page: Page) => void;
  initialTab?: SettingsTab;
}

const TABS: readonly TabDef<SettingsTab>[] = [
  { id: 'profile', label: 'Profil', icon: '👤', description: 'Benutzerprofil und Business-Daten' },
  { id: 'account', label: 'Konto', icon: '🔐', description: 'Passwort, MFA und Sessions' },
  { id: 'general', label: 'Allgemein', icon: '⚙️', description: 'Erscheinungsbild und Verhalten' },
  { id: 'ai', label: 'KI', icon: '🧠', description: 'KI-Modell und Antwort-Stil' },
  { id: 'privacy', label: 'Datenschutz', icon: '🔒', description: 'Daten-Kontrolle und Privatsphäre' },
  { id: 'automations', label: 'Automationen', icon: '⚡', description: 'Workflows und AI-Vorschläge' },
  { id: 'governance', label: 'Governance', icon: '🛡️', description: 'Genehmigungen, Audit-Trail, Richtlinien' },
  { id: 'integrations', label: 'Integrationen', icon: '🔗', description: 'OAuth, API Keys, Webhooks' },
  { id: 'mcp-servers', label: 'MCP Server', icon: '🔌', description: 'Externe MCP-Verbindungen' },
  { id: 'data', label: 'Daten', icon: '📦', description: 'Export und Synchronisation' },
];

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label: string }) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="settings-toggle-slider" />
    </label>
  );
}

function SettingsSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  label: string;
}) {
  return (
    <select
      className="settings-select neuro-focus-ring"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

const TabLoader = () => (
  <div className="settings-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

// ===========================================
// Account Tab (Konto) - Password, MFA, Sessions
// ===========================================

interface SessionInfo {
  id: string;
  device_info: string;
  ip_address: string;
  last_active: string;
  created_at: string;
  is_current: boolean;
}

function AccountTab() {
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
  const [sessionsMsg, setSesssionsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      setPasswordMsg({ type: 'error', text: 'Bitte alle Felder ausfuellen.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Neue Passwoerter stimmen nicht ueberein.' });
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
        setPasswordMsg({ type: 'success', text: 'Passwort erfolgreich geaendert.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMsg({ type: 'error', text: data.error || 'Fehler beim Aendern.' });
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
      const res = await fetch(`${apiUrl}/api/auth/mfa/enable`, {
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

  // MFA verify (completes enable)
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
        setMfaMsg({ type: 'error', text: data.error || 'Ungueltiger Code.' });
      }
    } catch {
      setMfaMsg({ type: 'error', text: 'Netzwerkfehler.' });
    } finally {
      setMfaLoading(false);
    }
  };

  // MFA disable
  const handleMfaDisable = async () => {
    const code = prompt('TOTP-Code eingeben um MFA zu deaktivieren:');
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

  // Revoke single session
  const handleRevokeSession = async (sessionId: string) => {
    setSesssionsMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setSesssionsMsg({ type: 'success', text: 'Session beendet.' });
      } else {
        setSesssionsMsg({ type: 'error', text: 'Fehler beim Beenden der Session.' });
      }
    } catch {
      setSesssionsMsg({ type: 'error', text: 'Netzwerkfehler.' });
    }
  };

  // Logout all
  const handleLogoutAll = async () => {
    if (!confirm('Alle Sessions beenden? Du wirst ueberall abgemeldet.')) return;
    setSesssionsMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/auth/logout-all`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        setSesssionsMsg({ type: 'success', text: 'Alle Sessions beendet.' });
        setSessions([]);
      } else {
        setSesssionsMsg({ type: 'error', text: 'Fehler.' });
      }
    } catch {
      setSesssionsMsg({ type: 'error', text: 'Netzwerkfehler.' });
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'inherit',
    outline: 'none',
    marginTop: '0.25rem',
  };

  const msgStyle = (type: 'success' | 'error'): React.CSSProperties => ({
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    fontSize: '0.8rem',
    fontWeight: 500,
    margin: '0.5rem 1.25rem',
    background: type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
    color: type === 'success' ? '#22c55e' : '#ef4444',
    border: `1px solid ${type === 'success' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
  });

  return (
    <div className="settings-section-content">
      {/* Password Change */}
      <div className="settings-group">
        <h3 className="settings-group-title">Passwort aendern</h3>
        {passwordMsg && <div style={msgStyle(passwordMsg.type)}>{passwordMsg.text}</div>}
        <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
          <div>
            <label className="settings-item-label" style={{ fontSize: '0.8rem' }}>Aktuelles Passwort</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              style={inputStyle}
              autoComplete="current-password"
              placeholder="Aktuelles Passwort"
            />
          </div>
          <div>
            <label className="settings-item-label" style={{ fontSize: '0.8rem' }}>Neues Passwort</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={inputStyle}
              autoComplete="new-password"
              placeholder="Mindestens 8 Zeichen"
            />
          </div>
          <div>
            <label className="settings-item-label" style={{ fontSize: '0.8rem' }}>Neues Passwort bestaetigen</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={inputStyle}
              autoComplete="new-password"
              placeholder="Passwort wiederholen"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
            <button
              type="button"
              className="settings-action-btn neuro-press-effect neuro-focus-ring"
              onClick={handlePasswordChange}
              disabled={passwordLoading}
            >
              {passwordLoading ? 'Wird geaendert...' : 'Passwort aendern'}
            </button>
          </div>
        </div>
      </div>

      {/* MFA */}
      <div className="settings-group">
        <h3 className="settings-group-title">Zwei-Faktor-Authentifizierung (MFA)</h3>
        {mfaMsg && <div style={msgStyle(mfaMsg.type)}>{mfaMsg.text}</div>}
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Status</span>
            <span className="settings-item-desc">
              {mfaEnabled ? 'MFA ist aktiviert' : 'MFA ist nicht aktiviert'}
            </span>
          </div>
          <span className="settings-item-value" style={{
            color: mfaEnabled ? '#22c55e' : 'inherit',
          }}>
            {mfaEnabled ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
        {!mfaEnabled && !mfaSetup && (
          <div className="settings-item" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="settings-action-btn neuro-press-effect neuro-focus-ring"
              onClick={handleMfaEnable}
              disabled={mfaLoading}
            >
              {mfaLoading ? 'Wird vorbereitet...' : 'MFA aktivieren'}
            </button>
          </div>
        )}
        {mfaSetup && (
          <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
            <div style={{ textAlign: 'center' }}>
              <p className="settings-item-desc" style={{ marginBottom: '0.5rem' }}>
                Scanne den QR-Code mit deiner Authenticator-App oder gib den Schluessel manuell ein:
              </p>
              {mfaSetup.qr_uri && (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaSetup.qr_uri)}`}
                  alt="MFA QR Code"
                  style={{ width: 200, height: 200, borderRadius: '8px', margin: '0.5rem auto', display: 'block' }}
                />
              )}
              <code style={{
                display: 'inline-block',
                padding: '0.35rem 0.75rem',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '6px',
                fontSize: '0.8rem',
                letterSpacing: '0.1em',
                wordBreak: 'break-all',
              }}>
                {mfaSetup.secret}
              </code>
            </div>
            <div>
              <label className="settings-item-label" style={{ fontSize: '0.8rem' }}>Verifizierungscode (6 Stellen)</label>
              <input
                type="text"
                value={mfaToken}
                onChange={e => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontSize: '1.1rem' }}
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="settings-action-btn neuro-press-effect neuro-focus-ring"
                onClick={() => { setMfaSetup(null); setMfaToken(''); }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="settings-action-btn neuro-press-effect neuro-focus-ring"
                onClick={handleMfaVerify}
                disabled={mfaLoading || mfaToken.length !== 6}
                style={{ background: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.3)' }}
              >
                {mfaLoading ? 'Wird verifiziert...' : 'Verifizieren & aktivieren'}
              </button>
            </div>
          </div>
        )}
        {mfaEnabled && (
          <div className="settings-item" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="settings-action-btn neuro-press-effect neuro-focus-ring"
              onClick={handleMfaDisable}
              disabled={mfaLoading}
              style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
            >
              MFA deaktivieren
            </button>
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="settings-group">
        <h3 className="settings-group-title">Aktive Sessions</h3>
        {sessionsMsg && <div style={msgStyle(sessionsMsg.type)}>{sessionsMsg.text}</div>}
        {sessionsLoading ? (
          <div style={{ padding: '1rem 1.25rem' }}>
            <SkeletonLoader type="text" count={3} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="settings-item">
            <span className="settings-item-desc">Keine aktiven Sessions gefunden.</span>
          </div>
        ) : (
          <>
            {sessions.map(s => (
              <div key={s.id} className="settings-item" style={{ gap: '0.5rem' }}>
                <div className="settings-item-info" style={{ flex: 1 }}>
                  <span className="settings-item-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {s.device_info || 'Unbekanntes Geraet'}
                    {s.is_current && (
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        background: 'rgba(34, 197, 94, 0.15)',
                        color: '#22c55e',
                        fontWeight: 600,
                      }}>
                        Aktuell
                      </span>
                    )}
                  </span>
                  <span className="settings-item-desc">
                    IP: {s.ip_address || '---'} &middot; Zuletzt aktiv: {formatDate(s.last_active || s.created_at)}
                  </span>
                </div>
                {!s.is_current && (
                  <button
                    type="button"
                    className="settings-action-btn neuro-press-effect neuro-focus-ring"
                    onClick={() => handleRevokeSession(s.id)}
                    style={{ borderColor: 'rgba(239, 68, 68, 0.3)', fontSize: '0.75rem' }}
                  >
                    Beenden
                  </button>
                )}
              </div>
            ))}
            <div className="settings-item" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="settings-action-btn neuro-press-effect neuro-focus-ring"
                onClick={handleLogoutAll}
                style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                Alle abmelden
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const SettingsDashboard = memo(({
  context,
  onBack,
  onNavigate,
  initialTab = 'general'
}: SettingsDashboardProps) => {
  const { activeTab, handleTabChange } = useTabNavigation<SettingsTab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'general',
    basePath: '/settings',
    rootTab: 'general',
  });
  const { settings, updateSetting } = useSettings();

  const handleResetHints = useCallback(() => {
    FEATURE_HINTS.forEach(hint => {
      try { localStorage.removeItem(`${STORAGE_KEY_PREFIX}${hint.id}`); } catch { /* noop */ }
    });
    alert('Feature-Hinweise wurden zurückgesetzt. Beim nächsten Seitenbesuch erscheinen sie erneut.');
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <Suspense fallback={<TabLoader />}>
            <ProfileDashboard onBack={() => handleTabChange('general')} context={context} embedded />
          </Suspense>
        );

      case 'account':
        return <AccountTab />;

      case 'general':
        return (
          <div className="settings-section-content">
            <div className="settings-group">
              <h3 className="settings-group-title">Erscheinungsbild</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Farbschema</span>
                  <span className="settings-item-desc">Wähle dein bevorzugtes Erscheinungsbild</span>
                </div>
                <SettingsSelect
                  value={settings.theme}
                  onChange={(val) => updateSetting('theme', val as 'dark' | 'light' | 'auto')}
                  label="Farbschema"
                  options={[
                    { value: 'dark', label: 'Dunkel' },
                    { value: 'light', label: 'Hell' },
                    { value: 'auto', label: 'Automatisch' },
                  ]}
                />
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Sprache</span>
                  <span className="settings-item-desc">Anzeigesprache der App</span>
                </div>
                <SettingsSelect
                  value={settings.language}
                  onChange={(val) => updateSetting('language', val as 'de' | 'en')}
                  label="Sprache"
                  options={[
                    { value: 'de', label: 'Deutsch' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Verhalten</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Startseite</span>
                  <span className="settings-item-desc">Was beim App-Start angezeigt wird</span>
                </div>
                <SettingsSelect
                  value={settings.startPage}
                  onChange={(val) => updateSetting('startPage', val as 'home' | 'ideas' | 'insights')}
                  label="Startseite"
                  options={[
                    { value: 'home', label: 'Dashboard' },
                    { value: 'ideas', label: 'Gedanken' },
                    { value: 'insights', label: 'Insights' },
                  ]}
                />
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Kontext</span>
                  <span className="settings-item-desc">Aktueller Arbeitsbereich</span>
                </div>
                <span className="settings-item-value">{context}</span>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Hilfe</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Feature-Hinweise zurücksetzen</span>
                  <span className="settings-item-desc">Zeigt die Einführungshinweise auf jeder Seite erneut an</span>
                </div>
                <button
                  type="button"
                  className="settings-action-btn neuro-press-effect neuro-focus-ring"
                  onClick={handleResetHints}
                >
                  Zurücksetzen
                </button>
              </div>
            </div>
          </div>
        );

      case 'ai':
        return (
          <div className="settings-section-content">
            <div className="settings-group">
              <h3 className="settings-group-title">KI-Modell</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Aktives Modell</span>
                  <span className="settings-item-desc">Primäres Sprachmodell für Antworten</span>
                </div>
                <SettingsSelect
                  value={settings.aiModel}
                  onChange={(val) => updateSetting('aiModel', val as 'claude-sonnet' | 'claude-haiku' | 'ollama')}
                  label="KI-Modell"
                  options={[
                    { value: 'claude-sonnet', label: 'Claude Sonnet' },
                    { value: 'claude-haiku', label: 'Claude Haiku' },
                    { value: 'ollama', label: 'Ollama (Lokal)' },
                  ]}
                />
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Fallback</span>
                  <span className="settings-item-desc">Lokales Modell bei Ausfall</span>
                </div>
                <span className="settings-item-value">Ollama</span>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Verhalten</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Proaktive Vorschläge</span>
                  <span className="settings-item-desc">KI schlägt eigenständig Ideen vor</span>
                </div>
                <ToggleSwitch
                  checked={settings.proactiveSuggestions}
                  onChange={(val) => updateSetting('proactiveSuggestions', val)}
                  label="Proaktive Vorschläge"
                />
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Memory-System</span>
                  <span className="settings-item-desc">HiMeS 4-Layer Architektur</span>
                </div>
                <ToggleSwitch
                  checked={settings.memorySystem}
                  onChange={(val) => updateSetting('memorySystem', val)}
                  label="Memory-System"
                />
              </div>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <Suspense fallback={<TabLoader />}>
            <MemoryGovernance context={context} />
          </Suspense>
        );

      case 'automations':
        return (
          <Suspense fallback={<TabLoader />}>
            <AutomationDashboard context={context} onBack={() => handleTabChange('general')} embedded />
          </Suspense>
        );

      case 'governance':
        return (
          <Suspense fallback={<TabLoader />}>
            <GovernanceDashboard context={context} />
          </Suspense>
        );

      case 'integrations':
        return (
          <Suspense fallback={<TabLoader />}>
            <IntegrationsPage onBack={() => handleTabChange('general')} embedded />
          </Suspense>
        );

      case 'mcp-servers':
        return (
          <Suspense fallback={<TabLoader />}>
            <MCPConnectionsPage context={context} />
          </Suspense>
        );

      case 'data':
        return (
          <Suspense fallback={<TabLoader />}>
            <DataManagement context={context} />
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Einstellungen"
      icon="⚙️"
      subtitle="App-Konfiguration und Datenschutz"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      onNavigate={onNavigate}
      ariaLabel="Einstellungs-Kategorien"
    >
      {renderTabContent()}
    </HubPage>
  );
});

SettingsDashboard.displayName = 'SettingsDashboard';
