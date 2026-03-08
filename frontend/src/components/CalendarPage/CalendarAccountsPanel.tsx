/**
 * CalendarAccountsPanel - Phase 40
 *
 * Manage iCloud/CalDAV calendar account connections.
 * Shown as a slide-out panel or modal in the calendar settings.
 */

import { useState } from 'react';
import type { CalendarAccount } from './useCalendarAccounts';
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
  onClose: () => void;
}

export function CalendarAccountsPanel({
  accounts,
  loading,
  error,
  onCreateAccount,
  onDeleteAccount,
  onSyncAccount,
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

  const handleConnect = async () => {
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
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    await onSyncAccount(id);
    setSyncingId(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Account trennen? Alle synchronisierten Termine werden entfernt.')) {
      await onDeleteAccount(id);
    }
  };

  return (
    <div className="cal-accounts-overlay" onClick={onClose}>
      <div className="cal-accounts" onClick={e => e.stopPropagation()}>
        <div className="cal-accounts__header">
          <h3>Kalender verbinden</h3>
          <button className="cal-accounts__close" onClick={onClose}>&times;</button>
        </div>

        <div className="cal-accounts__body">
          {/* Existing Accounts */}
          {accounts.map(account => (
            <div key={account.id} className="cal-accounts__card">
              <div className="cal-accounts__card-icon">
                {account.provider === 'icloud' ? '\uD83C\uDF0A' : '\uD83D\uDCC5'}
              </div>
              <div className="cal-accounts__card-info">
                <div className="cal-accounts__card-name">
                  {account.display_name || account.username}
                </div>
                <div className="cal-accounts__card-provider">
                  {account.provider === 'icloud' ? 'iCloud' : 'CalDAV'} &middot; {account.username}
                </div>
                <div className="cal-accounts__card-status">
                  {account.last_sync_at ? (
                    <>
                      Letzer Sync: {new Date(account.last_sync_at).toLocaleString('de-DE')}
                      {account.last_sync_error && (
                        <span className="cal-accounts__error"> — {account.last_sync_error}</span>
                      )}
                    </>
                  ) : (
                    'Noch nicht synchronisiert'
                  )}
                </div>
                {account.calendars.length > 0 && (
                  <div className="cal-accounts__calendars">
                    {account.calendars.filter(c => c.enabled).map((cal, i) => (
                      <span
                        key={i}
                        className="cal-accounts__calendar-chip"
                        style={{ borderColor: cal.color || 'var(--accent)' }}
                      >
                        {cal.displayName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="cal-accounts__card-actions">
                <button
                  className="cal-btn cal-btn--sm"
                  onClick={() => handleSync(account.id)}
                  disabled={syncingId === account.id}
                >
                  {syncingId === account.id ? 'Sync...' : 'Sync'}
                </button>
                <button
                  className="cal-btn cal-btn--sm cal-btn--danger-sm"
                  onClick={() => handleDelete(account.id)}
                >
                  Trennen
                </button>
              </div>
            </div>
          ))}

          {loading && accounts.length === 0 && (
            <div className="cal-accounts__loading">Lade Accounts...</div>
          )}

          {/* Add Account Form */}
          {showForm ? (
            <div className="cal-accounts__form">
              <h4>Neuen Kalender verbinden</h4>

              <div className="cal-accounts__provider-selector">
                <button
                  className={`cal-accounts__provider-btn ${formData.provider === 'icloud' ? 'active' : ''}`}
                  onClick={() => setFormData(p => ({ ...p, provider: 'icloud' }))}
                >
                  iCloud
                </button>
                <button
                  className={`cal-accounts__provider-btn ${formData.provider === 'caldav' ? 'active' : ''}`}
                  onClick={() => setFormData(p => ({ ...p, provider: 'caldav' }))}
                >
                  CalDAV
                </button>
              </div>

              <div className="cal-accounts__field">
                <label>Apple-ID / E-Mail</label>
                <input
                  type="email"
                  value={formData.username}
                  onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
                  placeholder="user@icloud.com"
                />
              </div>

              <div className="cal-accounts__field">
                <label>
                  App-spezifisches Passwort
                  <a
                    href="https://appleid.apple.com/account/manage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cal-accounts__help-link"
                  >
                    Erstellen
                  </a>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                />
              </div>

              <div className="cal-accounts__field">
                <label>Anzeigename (optional)</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={e => setFormData(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="Mein iCloud Kalender"
                />
              </div>

              {error && <div className="cal-accounts__form-error">{error}</div>}

              <div className="cal-accounts__form-actions">
                <button
                  className="cal-btn"
                  onClick={() => setShowForm(false)}
                  disabled={connecting}
                >
                  Abbrechen
                </button>
                <button
                  className="cal-btn cal-btn--primary"
                  onClick={handleConnect}
                  disabled={connecting || !formData.username || !formData.password}
                >
                  {connecting ? 'Verbinde...' : 'Verbinden'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="cal-accounts__add-btn"
              onClick={() => setShowForm(true)}
            >
              + Kalender hinzufügen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
