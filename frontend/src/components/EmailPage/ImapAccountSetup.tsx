/**
 * ImapAccountSetup - IMAP account setup modal (Phase 39)
 *
 * Allows users to connect their iCloud Mail (or other IMAP) account.
 * Includes connection test, account creation, and sync status display.
 */

import { useState, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';
import type { EmailAccount } from './types';
import { useEscapeKey } from '../../hooks/useClickOutside';
import { getErrorMessage } from '../../utils/errors';
import './ImapAccountSetup.css';

interface ImapAccountSetupProps {
  context: AIContext;
  accounts: EmailAccount[];
  onCreateAccount: (data: {
    email_address: string;
    display_name?: string;
    imap_host: string;
    imap_port: number;
    imap_user: string;
    imap_password: string;
    imap_tls: boolean;
  }) => Promise<void>;
  onTestConnection: (data: {
    host: string;
    port: number;
    user: string;
    password: string;
    tls: boolean;
  }) => Promise<{ success: boolean; mailboxes: string[] }>;
  onSync: (accountId: string) => Promise<{ newEmails: number; errors: number }>;
  onClose: () => void;
}

const ICLOUD_DEFAULTS = {
  host: 'imap.mail.me.com',
  port: 993,
  tls: true,
};

export function ImapAccountSetup({
  context: _context,
  accounts,
  onCreateAccount,
  onTestConnection,
  onSync,
  onClose,
}: ImapAccountSetupProps) {
  useEscapeKey(onClose);
  // Form state
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState(ICLOUD_DEFAULTS.host);
  const [port, setPort] = useState(ICLOUD_DEFAULTS.port);
  const [tls, setTls] = useState(ICLOUD_DEFAULTS.tls);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // UI state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; mailboxes?: string[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ accountId: string; newEmails: number } | null>(null);

  const imapAccounts = accounts.filter(a => a.imap_enabled);

  const handleTest = useCallback(async () => {
    if (!email || !password) {
      setError('E-Mail-Adresse und Passwort sind erforderlich');
      return;
    }

    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await onTestConnection({
        host,
        port,
        user: email,
        password,
        tls,
      });
      setTestResult(result);
    } catch (err) {
      setError(getErrorMessage(err, 'Verbindungstest fehlgeschlagen'));
    } finally {
      setTesting(false);
    }
  }, [email, password, host, port, tls, onTestConnection]);

  const handleCreate = useCallback(async () => {
    if (!email || !password) {
      setError('E-Mail-Adresse und Passwort sind erforderlich');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      await onCreateAccount({
        email_address: email,
        display_name: displayName || undefined,
        imap_host: host,
        imap_port: port,
        imap_user: email,
        imap_password: password,
        imap_tls: tls,
      });

      // Reset form
      setEmail('');
      setPassword('');
      setDisplayName('');
      setTestResult(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Konto konnte nicht erstellt werden'));
    } finally {
      setCreating(false);
    }
  }, [email, displayName, password, host, port, tls, onCreateAccount]);

  const handleSync = useCallback(async (accountId: string) => {
    setSyncing(accountId);
    setSyncResult(null);
    setError(null);

    try {
      const result = await onSync(accountId);
      setSyncResult({ accountId, newEmails: result.newEmails });
    } catch (err) {
      setError(getErrorMessage(err, 'Sync fehlgeschlagen'));
    } finally {
      setSyncing(null);
    }
  }, [onSync]);

  const formatSyncTime = (dateStr: string | null) => {
    if (!dateStr) return 'Noch nie';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.round((now.getTime() - date.getTime()) / 60000);
    if (diffMin < 1) return 'Gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min.`;
    if (diffMin < 1440) return `vor ${Math.round(diffMin / 60)} Std.`;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="imap-setup-overlay" onClick={onClose} role="presentation">
      <div className="imap-setup-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="E-Mail-Konto verbinden">
        <div className="imap-setup-header">
          <h2>E-Mail-Konto verbinden</h2>
          <button className="imap-setup-close" onClick={onClose}>&times;</button>
        </div>

        <div className="imap-setup-content">
          {/* Existing IMAP accounts */}
          {imapAccounts.length > 0 && (
            <div className="imap-accounts-list">
              <h3>Verbundene Konten</h3>
              {imapAccounts.map(account => (
                <div key={account.id} className="imap-account-item">
                  <div className="imap-account-info">
                    <span className="imap-account-email">{account.email_address}</span>
                    <span className="imap-account-sync">
                      {account.sync_error ? (
                        <span className="imap-sync-error" title={account.sync_error}>Fehler</span>
                      ) : (
                        <span className="imap-sync-ok">Letzte Sync: {formatSyncTime(account.last_sync_at)}</span>
                      )}
                    </span>
                    {syncResult?.accountId === account.id && (
                      <span className="imap-sync-result">
                        {syncResult.newEmails} neue E-Mail(s)
                      </span>
                    )}
                  </div>
                  <button
                    className="imap-sync-button"
                    onClick={() => handleSync(account.id)}
                    disabled={syncing === account.id}
                  >
                    {syncing === account.id ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* New account form */}
          <div className="imap-setup-form">
            <h3>Neues IMAP-Konto hinzufuegen</h3>

            <div className="imap-info-box">
              <strong>iCloud Mail:</strong> Du benoetigst ein{' '}
              <a
                href="https://appleid.apple.com/account/manage"
                target="_blank"
                rel="noopener noreferrer"
              >
                App-spezifisches Passwort
              </a>
              {' '}(nicht dein iCloud-Passwort).
            </div>

            <div className="imap-form-group">
              <label>E-Mail-Adresse</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@icloud.com"
              />
            </div>

            <div className="imap-form-group">
              <label>App-spezifisches Passwort</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
              />
            </div>

            <div className="imap-form-group">
              <label>Anzeigename (optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Mein iCloud-Konto"
              />
            </div>

            <button
              className="imap-advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Erweiterte Einstellungen ausblenden' : 'Erweiterte Einstellungen'}
            </button>

            {showAdvanced && (
              <div className="imap-advanced-fields">
                <div className="imap-form-row">
                  <div className="imap-form-group">
                    <label>IMAP Server</label>
                    <input
                      type="text"
                      value={host}
                      onChange={e => setHost(e.target.value)}
                    />
                  </div>
                  <div className="imap-form-group imap-form-small">
                    <label>Port</label>
                    <input
                      type="number"
                      value={port}
                      onChange={e => setPort(parseInt(e.target.value) || 993)}
                    />
                  </div>
                </div>
                <label className="imap-checkbox">
                  <input
                    type="checkbox"
                    checked={tls}
                    onChange={e => setTls(e.target.checked)}
                  />
                  SSL/TLS verwenden
                </label>
              </div>
            )}

            {error && <div className="imap-error">{error}</div>}

            {testResult?.success && (
              <div className="imap-success">
                Verbindung erfolgreich! {testResult.mailboxes?.length || 0} Postfaecher gefunden.
              </div>
            )}

            <div className="imap-form-actions">
              <button
                className="imap-button-secondary"
                onClick={handleTest}
                disabled={testing || !email || !password}
              >
                {testing ? 'Teste...' : 'Verbindung testen'}
              </button>
              <button
                className="imap-button-primary"
                onClick={handleCreate}
                disabled={creating || !email || !password}
              >
                {creating ? 'Erstelle...' : 'Konto verbinden'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
