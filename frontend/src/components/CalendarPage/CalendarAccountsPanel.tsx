/**
 * CalendarAccountsPanel - Phase 40
 *
 * Manage iCloud/CalDAV calendar account connections.
 * Slide-out panel with connection form, account management, and calendar toggles.
 */

import { useState, useCallback } from 'react';
import type { CalendarAccount, CalendarAccountCalendar } from './useCalendarAccounts';
import { useEscapeKey } from '../../hooks/useClickOutside';
import './CalendarAccountsPanel.css';

interface Props {
  accounts: CalendarAccount[];
  loading: boolean;
  error: string | null;
  onCreateAccount: (data: {
    provider: string;
    username: string;
    password: string;
    display_name?: string;
  }) => Promise<CalendarAccount | null>;
  onDeleteAccount: (id: string) => Promise<boolean>;
  onSyncAccount: (id: string) => Promise<unknown>;
  onUpdateAccount?: (id: string, updates: Partial<CalendarAccount>) => Promise<unknown>;
  onClose: () => void;
}

type SyncResult = { created: number; updated: number; deleted: number; errors: number } | null;

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
}

const PROVIDER_INFO: Record<string, { icon: string; label: string; color: string }> = {
  icloud: { icon: '☁️', label: 'iCloud', color: '#3478F6' },
  google: { icon: '📅', label: 'Google', color: '#4285F4' },
  caldav: { icon: '🔗', label: 'CalDAV', color: '#6B8E7B' },
  ics: { icon: '📋', label: 'ICS', color: '#9B6BD9' },
};

function isRemindersCalendar(cal: CalendarAccountCalendar): boolean {
  const name = cal.displayName.toLowerCase();
  return name.includes('erinnerung') || name.includes('reminder') || name.includes('aufgaben') || name.includes('tasks');
}

export function CalendarAccountsPanel({
  accounts,
  loading,
  error,
  onCreateAccount,
  onDeleteAccount,
  onSyncAccount,
  onUpdateAccount,
  onClose,
}: Props) {
  const [showForm, setShowForm] = useState(accounts.length === 0);
  const [formData, setFormData] = useState({
    provider: 'icloud',
    username: '',
    password: '',
    display_name: '',
  });
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!formData.username || !formData.password) return;

    setConnecting(true);
    const result = await onCreateAccount({
      provider: formData.provider,
      username: formData.username,
      password: formData.password,
      display_name: formData.display_name || undefined,
    });

    if (result) {
      setShowForm(false);
      setFormData({ provider: 'icloud', username: '', password: '', display_name: '' });
    }
    setConnecting(false);
  }, [formData, onCreateAccount]);

  const handleSync = useCallback(async (id: string) => {
    setSyncingId(id);
    setSyncResult(null);
    try {
      const result = await onSyncAccount(id);
      if (result && typeof result === 'object') {
        setSyncResult(result as SyncResult);
      }
    } finally {
      setSyncingId(null);
      // Auto-clear result after 5s
      setTimeout(() => setSyncResult(null), 5000);
    }
  }, [onSyncAccount]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Kalender-Verbindung trennen?\nAlle synchronisierten Termine werden entfernt.')) return;
    setDeletingId(id);
    await onDeleteAccount(id);
    setDeletingId(null);
  }, [onDeleteAccount]);

  const handleToggleCalendar = useCallback(async (account: CalendarAccount, calIndex: number) => {
    if (!onUpdateAccount) return;
    const updatedCalendars = account.calendars.map((cal, i) =>
      i === calIndex ? { ...cal, enabled: !cal.enabled } : cal
    );
    await onUpdateAccount(account.id, { calendars: updatedCalendars } as Partial<CalendarAccount>);
  }, [onUpdateAccount]);

  const providerInfo = PROVIDER_INFO[formData.provider] || PROVIDER_INFO.caldav;
  useEscapeKey(onClose);

  return (
    <div className="cal-accounts-overlay" onClick={onClose} role="presentation">
      <div className="cal-accounts" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Kalender-Verbindungen">
        {/* Header */}
        <div className="cal-accounts__header">
          <div className="cal-accounts__header-left">
            <h3>Kalender-Verbindungen</h3>
            <span className="cal-accounts__count">
              {accounts.length} {accounts.length === 1 ? 'Konto' : 'Konten'}
            </span>
          </div>
          <button className="cal-accounts__close" onClick={onClose} aria-label="Schließen">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="cal-accounts__body">
          {/* Connected Accounts */}
          {accounts.map(account => {
            const info = PROVIDER_INFO[account.provider] || PROVIDER_INFO.caldav;
            const isSyncing = syncingId === account.id;
            const isDeleting = deletingId === account.id;
            const enabledCount = account.calendars.filter(c => c.enabled).length;

            return (
              <div key={account.id} className={`cal-accounts__card ${isSyncing ? 'cal-accounts__card--syncing' : ''}`}>
                {/* Provider badge */}
                <div className="cal-accounts__card-badge" style={{ background: info.color }}>
                  <span>{info.icon}</span>
                </div>

                <div className="cal-accounts__card-info">
                  <div className="cal-accounts__card-top">
                    <div>
                      <div className="cal-accounts__card-name">
                        {account.display_name || account.username}
                      </div>
                      <div className="cal-accounts__card-meta">
                        {info.label} · {account.username}
                      </div>
                    </div>
                    <div className="cal-accounts__card-status-dot"
                      style={{ background: account.last_sync_error ? '#D94A4A' : account.last_sync_at ? '#34C759' : '#8E8E93' }}
                      title={account.last_sync_error || (account.last_sync_at ? 'Synchronisiert' : 'Nicht synchronisiert')}
                    />
                  </div>

                  {/* Sync Status */}
                  <div className="cal-accounts__card-sync">
                    {account.last_sync_at ? (
                      <span className="cal-accounts__sync-time">
                        Letzter Sync: {relativeTime(account.last_sync_at)}
                      </span>
                    ) : (
                      <span className="cal-accounts__sync-time cal-accounts__sync-time--pending">
                        Noch nicht synchronisiert
                      </span>
                    )}
                    {account.last_sync_error && (
                      <span className="cal-accounts__sync-error">{account.last_sync_error}</span>
                    )}
                  </div>

                  {/* Sync Result Toast */}
                  {syncResult && syncingId === null && (
                    <div className="cal-accounts__sync-result">
                      <span className="cal-accounts__sync-result-icon">✓</span>
                      {syncResult.created} neu · {syncResult.updated} aktualisiert · {syncResult.deleted} gelöscht
                      {syncResult.errors > 0 && <span className="cal-accounts__sync-result-errors"> · {syncResult.errors} Fehler</span>}
                    </div>
                  )}

                  {/* Calendar List with Toggles */}
                  {account.calendars.length > 0 && (
                    <div className="cal-accounts__calendars">
                      {account.calendars.map((cal, i) => {
                        const isReminders = isRemindersCalendar(cal);
                        return (
                          <button
                            key={i}
                            className={`cal-accounts__calendar-chip ${cal.enabled ? '' : 'cal-accounts__calendar-chip--disabled'} ${isReminders ? 'cal-accounts__calendar-chip--reminders' : ''}`}
                            onClick={() => handleToggleCalendar(account, i)}
                            title={isReminders
                              ? 'Erinnerungen/Aufgaben — Sync limitiert (VTODO)'
                              : cal.enabled ? `${cal.displayName} deaktivieren` : `${cal.displayName} aktivieren`
                            }
                          >
                            <span
                              className="cal-accounts__calendar-dot"
                              style={{ background: cal.enabled ? (cal.color || info.color) : 'var(--text-secondary)' }}
                            />
                            <span className="cal-accounts__calendar-name">{cal.displayName}</span>
                            {isReminders && <span className="cal-accounts__calendar-warn">⚠</span>}
                            {!isReminders && (
                              <span className="cal-accounts__calendar-toggle">
                                {cal.enabled ? '✓' : '○'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      <span className="cal-accounts__calendar-hint">
                        {enabledCount}/{account.calendars.length} aktiv
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="cal-accounts__card-actions">
                    <button
                      className="cal-accounts__action-btn cal-accounts__action-btn--sync"
                      onClick={() => handleSync(account.id)}
                      disabled={isSyncing || isDeleting}
                    >
                      {isSyncing ? (
                        <>
                          <span className="cal-accounts__spinner" />
                          Synchronisiere...
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M1.75 7C1.75 4.1 4.1 1.75 7 1.75c1.7 0 3.2.82 4.15 2.08M12.25 7c0 2.9-2.35 5.25-5.25 5.25-1.7 0-3.2-.82-4.15-2.08" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                            <path d="M10.5 1.75v2.33h-2.33M3.5 12.25V9.92h2.33" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Synchronisieren
                        </>
                      )}
                    </button>
                    <button
                      className="cal-accounts__action-btn cal-accounts__action-btn--danger"
                      onClick={() => handleDelete(account.id)}
                      disabled={isSyncing || isDeleting}
                    >
                      {isDeleting ? 'Wird entfernt...' : 'Trennen'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {loading && accounts.length === 0 && (
            <div className="cal-accounts__loading">
              <span className="cal-accounts__spinner" />
              Lade verbundene Kalender...
            </div>
          )}

          {/* Connection Form */}
          {showForm ? (
            <div className="cal-accounts__form">
              <h4>Neuen Kalender verbinden</h4>

              {/* Provider Selector */}
              <div className="cal-accounts__provider-selector">
                {Object.entries(PROVIDER_INFO).filter(([key]) => key !== 'ics').map(([key, info]) => (
                  <button
                    key={key}
                    className={`cal-accounts__provider-btn ${formData.provider === key ? 'active' : ''}`}
                    onClick={() => setFormData(p => ({ ...p, provider: key }))}
                  >
                    <span className="cal-accounts__provider-icon">{info.icon}</span>
                    <span>{info.label}</span>
                  </button>
                ))}
              </div>

              {/* Provider-specific help text */}
              <div className="cal-accounts__help-banner">
                {formData.provider === 'icloud' ? (
                  <>
                    <strong>iCloud Kalender</strong> — Nutze ein <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer">App-spezifisches Passwort</a> (nicht dein iCloud-Passwort)
                  </>
                ) : formData.provider === 'google' ? (
                  <>
                    <strong>Google Kalender</strong> — Nutze ein App-Passwort aus den Google-Kontoeinstellungen
                  </>
                ) : (
                  <>
                    <strong>CalDAV Server</strong> — Gib die vollständige CalDAV-URL deines Servers an
                  </>
                )}
              </div>

              <div className="cal-accounts__field">
                <label>{formData.provider === 'icloud' ? 'Apple-ID' : 'E-Mail / Benutzername'}</label>
                <input
                  type="email"
                  value={formData.username}
                  onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
                  placeholder={formData.provider === 'icloud' ? 'name@icloud.com' : 'user@example.com'}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="cal-accounts__field">
                <label>
                  {formData.provider === 'icloud' ? 'App-spezifisches Passwort' : 'Passwort'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder={formData.provider === 'icloud' ? 'xxxx-xxxx-xxxx-xxxx' : '••••••••'}
                  autoComplete="current-password"
                />
              </div>

              <div className="cal-accounts__field">
                <label>Anzeigename <span className="cal-accounts__optional">(optional)</span></label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={e => setFormData(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="z.B. Mein iCloud Kalender"
                />
              </div>

              {error && (
                <div className="cal-accounts__form-error">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M7 4v3.5M7 9.5v.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  {error}
                </div>
              )}

              <div className="cal-accounts__form-actions">
                <button
                  className="cal-accounts__action-btn"
                  onClick={() => setShowForm(false)}
                  disabled={connecting}
                >
                  Abbrechen
                </button>
                <button
                  className="cal-accounts__action-btn cal-accounts__action-btn--primary"
                  onClick={handleConnect}
                  disabled={connecting || !formData.username || !formData.password}
                >
                  {connecting ? (
                    <>
                      <span className="cal-accounts__spinner" />
                      Verbinde...
                    </>
                  ) : (
                    <>
                      <span style={{ color: providerInfo.color }}>{providerInfo.icon}</span>
                      Verbinden
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="cal-accounts__add-btn"
              onClick={() => setShowForm(true)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Kalender hinzufügen
            </button>
          )}
        </div>

        {/* Footer with info */}
        <div className="cal-accounts__footer">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5v0a4.5 4.5 0 014.5 4.5v0A4.5 4.5 0 016 10.5v0A4.5 4.5 0 011.5 6v0A4.5 4.5 0 016 1.5z" stroke="currentColor" strokeWidth="1"/>
            <path d="M6 4v2.5l1.5 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          Passwörter werden verschlüsselt gespeichert (AES-256-GCM)
        </div>
      </div>
    </div>
  );
}
