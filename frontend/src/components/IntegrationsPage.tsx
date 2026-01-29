/**
 * Phase 4: Integrations Dashboard
 * Manage external integrations (Microsoft, Slack, Webhooks, API Keys)
 */

import { useState, useEffect } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { getRandomReward } from '../utils/aiPersonality';
import '../neurodesign.css';

// Type-safe error extraction
interface ApiError {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError;
  return apiError.response?.data?.message || apiError.message || fallback;
}

interface Integration {
  id: string;
  provider: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  isConnected: boolean;
  features: string[];
  lastSyncAt?: string;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  errorMessage?: string;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  isActive: boolean;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt?: string;
  failureCount: number;
}

interface IntegrationsPageProps {
  onBack: () => void;
}

export function IntegrationsPage({ onBack }: IntegrationsPageProps) {
  const [activeTab, setActiveTab] = useState<'integrations' | 'apikeys' | 'webhooks'>('integrations');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read']);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['idea.created']);
  const confirm = useConfirm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [intRes, keysRes, webhooksRes] = await Promise.all([
        axios.get('/api/integrations'),
        axios.get('/api/keys'),
        axios.get('/api/webhooks')
      ]);
      setIntegrations(intRes.data.integrations);
      setApiKeys(keysRes.data.apiKeys);
      setWebhooks(webhooksRes.data.webhooks);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Daten konnten nicht geladen werden'));
    } finally {
      setLoading(false);
    }
  };

  // SECURITY: Whitelist of allowed OAuth provider domains
  const ALLOWED_OAUTH_DOMAINS = [
    'login.microsoftonline.com',
    'accounts.google.com',
    'slack.com',
    'github.com',
    'oauth.slack.com',
  ];

  const connectIntegration = async (provider: string) => {
    try {
      const response = await axios.get(`/api/integrations/${provider}/auth`);
      const authUrl = response.data.authUrl;

      // SECURITY: Validate OAuth URL to prevent open redirect attacks
      try {
        const url = new URL(authUrl);
        const isAllowedDomain = ALLOWED_OAUTH_DOMAINS.some(
          domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        );

        if (!isAllowedDomain) {
          console.error('OAuth URL domain not in whitelist:', url.hostname);
          setError(`Sicherheitsfehler: Ungültige OAuth-URL für ${provider}`);
          return;
        }

        window.location.href = authUrl;
      } catch {
        console.error('Invalid OAuth URL received:', authUrl);
        setError(`Ungültige OAuth-URL für ${provider}`);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, `Verbindung zu ${provider} fehlgeschlagen`));
    }
  };

  const disconnectIntegration = async (provider: string) => {
    const confirmed = await confirm({
      title: 'Integration trennen',
      message: `Möchtest du ${provider} wirklich trennen? Du müsstest dich erneut anmelden, um die Verbindung wiederherzustellen.`,
      confirmText: 'Trennen',
      variant: 'warning',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`/api/integrations/${provider}`);
      showToast(`${provider} wurde getrennt`, 'success');
      loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Trennung fehlgeschlagen'));
    }
  };

  const syncIntegration = async (provider: string) => {
    try {
      setIntegrations(prev => prev.map(i =>
        i.provider === provider ? { ...i, syncStatus: 'syncing' as const } : i
      ));
      await axios.post(`/api/integrations/${provider}/sync`);
      showToast('Synchronisation gestartet', 'success');
      loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Synchronisation fehlgeschlagen'));
      loadData();
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const response = await axios.post('/api/keys', {
        name: newKeyName,
        scopes: newKeyScopes
      });
      setCreatedKey(response.data.apiKey.key);
      setNewKeyName('');
      showActionReward();
      loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'API Key konnte nicht erstellt werden'));
    }
  };

  const deleteApiKey = async (id: string) => {
    const confirmed = await confirm({
      title: 'API Key löschen',
      message: 'Möchtest du diesen API Key wirklich löschen? Alle Anwendungen, die diesen Key verwenden, verlieren den Zugang.',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`/api/keys/${id}`);
      showToast('API Key gelöscht', 'success');
      loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'API Key konnte nicht gelöscht werden'));
    }
  };

  const createWebhook = async () => {
    if (!newWebhookName.trim() || !newWebhookUrl.trim()) return;
    try {
      await axios.post('/api/webhooks', {
        name: newWebhookName,
        url: newWebhookUrl,
        events: newWebhookEvents
      });
      setNewWebhookName('');
      setNewWebhookUrl('');
      showActionReward();
      loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Webhook konnte nicht erstellt werden'));
    }
  };

  const deleteWebhook = async (id: string) => {
    const confirmed = await confirm({
      title: 'Webhook löschen',
      message: 'Möchtest du diesen Webhook wirklich löschen? Externe Dienste werden keine Benachrichtigungen mehr erhalten.',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await axios.delete(`/api/webhooks/${id}`);
      showToast('Webhook gelöscht', 'success');
      loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Webhook konnte nicht gelöscht werden'));
    }
  };

  const testWebhook = async (id: string) => {
    try {
      await axios.post(`/api/webhooks/${id}/test`);
      showToast('Test-Webhook gesendet!', 'success');
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Test fehlgeschlagen'), 'error');
    }
  };

  const availableEvents = [
    'idea.created', 'idea.updated', 'idea.deleted', 'idea.archived',
    'meeting.created', 'meeting.updated', 'meeting.completed',
    'calendar.synced', 'slack.message_processed'
  ];

  // Show reward on successful action
  const showActionReward = () => {
    const reward = getRandomReward('ideaCreated');
    showToast(`${reward.emoji} ${reward.message}`, 'success');
  };

  if (loading) {
    return (
      <div className="page integrations-page neuro-page-enter">
        <header className="page-header">
          <button
            type="button"
            className="back-button neuro-hover-lift"
            onClick={onBack}
            aria-label="Zurück zur Übersicht"
          >
            ← Zurück
          </button>
          <h1>⚙️ Integrationen</h1>
        </header>
        <div className="neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Integrationen...</p>
          <p className="neuro-loading-submessage">Verbindungen werden geprüft</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page integrations-page neuro-page-enter">
      <header className="page-header">
        <button
          type="button"
          className="back-button neuro-hover-lift"
          onClick={onBack}
          aria-label="Zurück zur Übersicht"
        >
          ← Zurück
        </button>
        <h1>⚙️ Integrationen</h1>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fehlermeldung schließen"
          >
            ×
          </button>
        </div>
      )}

      {createdKey && (
        <div className="success-banner" role="alert">
          <strong>API Key erstellt! Kopiere diesen Key jetzt - er wird nicht wieder angezeigt:</strong>
          <code className="api-key-display">{createdKey}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(createdKey);
              showToast('In Zwischenablage kopiert!', 'success');
            }}
            aria-label="API Key in Zwischenablage kopieren"
          >
            📋 Kopieren
          </button>
          <button
            type="button"
            onClick={() => setCreatedKey(null)}
            aria-label="Erfolgs-Banner schließen"
          >
            ×
          </button>
        </div>
      )}

      <div className="tabs" role="group" aria-label="Integrations-Tabs">
        <button
          type="button"
          className={`neuro-press-effect ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
          aria-current={activeTab === 'integrations' ? 'true' : undefined}
        >
          🔗 Integrationen
        </button>
        <button
          type="button"
          className={`neuro-press-effect ${activeTab === 'apikeys' ? 'active' : ''}`}
          onClick={() => setActiveTab('apikeys')}
          aria-current={activeTab === 'apikeys' ? 'true' : undefined}
        >
          🔑 API Keys
        </button>
        <button
          type="button"
          className={`neuro-press-effect ${activeTab === 'webhooks' ? 'active' : ''}`}
          onClick={() => setActiveTab('webhooks')}
          aria-current={activeTab === 'webhooks' ? 'true' : undefined}
        >
          🪝 Webhooks
        </button>
      </div>

      <main className="integrations-content">
        {activeTab === 'integrations' && (
          <div className="integrations-grid neuro-flow-list">
            {integrations.map(integration => (
              <div key={integration.id} className={`integration-card ${integration.isConnected ? 'connected' : ''}`}>
                <div className="integration-header">
                  <span className="integration-icon">
                    {integration.provider === 'microsoft' ? '📧' : integration.provider === 'slack' ? '💬' : '🔗'}
                  </span>
                  <div className="integration-info">
                    <h3>{integration.name}</h3>
                    <p>{integration.description || `${integration.provider} Integration`}</p>
                  </div>
                  <span className={`status-badge ${integration.isConnected ? 'connected' : 'disconnected'}`}>
                    {integration.isConnected ? 'Verbunden' : 'Nicht verbunden'}
                  </span>
                </div>

                <div className="integration-features">
                  {integration.features?.map(feature => (
                    <span key={feature} className="feature-tag">{feature}</span>
                  ))}
                </div>

                {integration.isConnected && integration.lastSyncAt && (
                  <div className="sync-info">
                    <span className={`sync-status ${integration.syncStatus}`}>
                      {integration.syncStatus === 'syncing' ? '⏳' :
                       integration.syncStatus === 'success' ? '✅' :
                       integration.syncStatus === 'error' ? '❌' : '⏸️'}
                    </span>
                    <span>Letzter Sync: {new Date(integration.lastSyncAt).toLocaleString('de-DE')}</span>
                  </div>
                )}

                {integration.errorMessage && (
                  <div className="error-message">{integration.errorMessage}</div>
                )}

                <div className="integration-actions">
                  {integration.isConnected ? (
                    <>
                      <button
                        type="button"
                        className="sync-button neuro-button"
                        onClick={() => syncIntegration(integration.provider)}
                        disabled={integration.syncStatus === 'syncing'}
                        aria-label={`${integration.name} synchronisieren`}
                      >
                        {integration.syncStatus === 'syncing' ? 'Sync läuft...' : '🔄 Jetzt synchronisieren'}
                      </button>
                      <button
                        type="button"
                        className="disconnect-button neuro-hover-lift"
                        onClick={() => disconnectIntegration(integration.provider)}
                        aria-label={`${integration.name} trennen`}
                      >
                        Trennen
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="connect-button neuro-button"
                      onClick={() => connectIntegration(integration.provider)}
                      aria-label={`Mit ${integration.name} verbinden`}
                    >
                      🔗 Verbinden
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'apikeys' && (
          <div className="apikeys-section">
            <div className="create-form">
              <h3>Neuen API Key erstellen</h3>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Name (z.B. 'Zapier Integration')"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                />
                <div className="scopes-selector">
                  <label>
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes('read')}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewKeyScopes([...newKeyScopes, 'read']);
                        } else {
                          setNewKeyScopes(newKeyScopes.filter(s => s !== 'read'));
                        }
                      }}
                    /> Read
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes('write')}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewKeyScopes([...newKeyScopes, 'write']);
                        } else {
                          setNewKeyScopes(newKeyScopes.filter(s => s !== 'write'));
                        }
                      }}
                    /> Write
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes('admin')}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewKeyScopes([...newKeyScopes, 'admin']);
                        } else {
                          setNewKeyScopes(newKeyScopes.filter(s => s !== 'admin'));
                        }
                      }}
                    /> Admin
                  </label>
                </div>
                <button
                  type="button"
                  className="neuro-button"
                  onClick={createApiKey}
                  disabled={!newKeyName.trim()}
                  aria-label="Neuen API Key erstellen"
                >
                  + Erstellen
                </button>
              </div>
            </div>

            <div className="apikeys-list">
              <h3>Vorhandene API Keys</h3>
              {apiKeys.length === 0 ? (
                <div className="neuro-empty-state">
                  <span className="neuro-empty-icon">🔑</span>
                  <h3 className="neuro-empty-title">Noch keine API Keys</h3>
                  <p className="neuro-empty-description">Erstelle deinen ersten API Key für externe Integrationen.</p>
                  <p className="neuro-empty-encouragement">API Keys ermöglichen automatisierte Workflows.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Key</th>
                      <th>Scopes</th>
                      <th>Letzte Nutzung</th>
                      <th>Status</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map(key => (
                      <tr key={key.id} className={key.isActive ? '' : 'inactive'}>
                        <td>{key.name}</td>
                        <td><code>{key.keyPrefix}...</code></td>
                        <td>{key.scopes.join(', ')}</td>
                        <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('de-DE') : 'Nie'}</td>
                        <td>
                          <span className={`status-badge ${key.isActive ? 'active' : 'inactive'}`}>
                            {key.isActive ? 'Aktiv' : 'Inaktiv'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="delete-button neuro-hover-lift"
                            onClick={() => deleteApiKey(key.id)}
                            aria-label={`API Key ${key.name} löschen`}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="webhooks-section">
            <div className="create-form">
              <h3>Neuen Webhook erstellen</h3>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Name (z.B. 'Slack Notification')"
                  value={newWebhookName}
                  onChange={e => setNewWebhookName(e.target.value)}
                />
                <input
                  type="url"
                  placeholder="Webhook URL (https://...)"
                  value={newWebhookUrl}
                  onChange={e => setNewWebhookUrl(e.target.value)}
                />
              </div>
              <div className="events-selector">
                <label>Events:</label>
                <div className="events-grid">
                  {availableEvents.map(event => (
                    <label key={event}>
                      <input
                        type="checkbox"
                        checked={newWebhookEvents.includes(event)}
                        onChange={e => {
                          if (e.target.checked) {
                            setNewWebhookEvents([...newWebhookEvents, event]);
                          } else {
                            setNewWebhookEvents(newWebhookEvents.filter(ev => ev !== event));
                          }
                        }}
                      />
                      {event}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="neuro-button"
                onClick={createWebhook}
                disabled={!newWebhookName.trim() || !newWebhookUrl.trim()}
                aria-label="Neuen Webhook erstellen"
              >
                + Webhook erstellen
              </button>
            </div>

            <div className="webhooks-list">
              <h3>Aktive Webhooks</h3>
              {webhooks.length === 0 ? (
                <div className="neuro-empty-state">
                  <span className="neuro-empty-icon">🪝</span>
                  <h3 className="neuro-empty-title">Noch keine Webhooks</h3>
                  <p className="neuro-empty-description">Konfiguriere Webhooks um externe Dienste zu benachrichtigen.</p>
                  <p className="neuro-empty-encouragement">Webhooks verbinden deine Tools nahtlos.</p>
                </div>
              ) : (
                <div className="webhooks-grid neuro-flow-list">
                  {webhooks.map(webhook => (
                    <div key={webhook.id} className={`webhook-card ${webhook.isActive ? 'active' : 'inactive'}`}>
                      <div className="webhook-header">
                        <h4>{webhook.name}</h4>
                        <span className={`status-badge ${webhook.isActive ? 'active' : 'inactive'}`}>
                          {webhook.isActive ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </div>
                      <div className="webhook-url">
                        <code>{webhook.url.substring(0, 50)}...</code>
                      </div>
                      <div className="webhook-events">
                        {webhook.events.map(event => (
                          <span key={event} className="event-tag">{event}</span>
                        ))}
                      </div>
                      {webhook.lastTriggeredAt && (
                        <div className="webhook-stats">
                          Letzter Aufruf: {new Date(webhook.lastTriggeredAt).toLocaleString('de-DE')}
                          {webhook.failureCount > 0 && (
                            <span className="failure-count">⚠️ {webhook.failureCount} Fehler</span>
                          )}
                        </div>
                      )}
                      <div className="webhook-actions">
                        <button
                          type="button"
                          className="neuro-hover-lift"
                          onClick={() => testWebhook(webhook.id)}
                          aria-label={`Webhook ${webhook.name} testen`}
                        >
                          🧪 Testen
                        </button>
                        <button
                          type="button"
                          className="delete-button neuro-hover-lift"
                          onClick={() => deleteWebhook(webhook.id)}
                          aria-label={`Webhook ${webhook.name} löschen`}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        /* Neuro-UX optimierte Integrations Page */
        .integrations-page {
          min-height: 100vh;
          background: var(--bg-primary);
        }

        /* Neuro Page Enter Animation */
        .integrations-page.neuro-page-enter {
          animation: pageEnter 450ms ease-out;
        }

        @keyframes pageEnter {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .page-header {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 2rem;
          padding-left: 80px; /* Platz für macOS Traffic Lights */
          background: var(--glass-bg);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid var(--glass-border);
          -webkit-app-region: drag;
        }

        .page-header button,
        .page-header a,
        .page-header input {
          -webkit-app-region: no-drag;
        }

        .back-button {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 1rem;
        }

        @media (max-width: 768px) {
          .page-header {
            padding-left: 1rem; /* Kein Traffic Lights auf Mobile */
          }
        }

        .tabs {
          display: flex;
          gap: 0.5rem;
          padding: 1rem 2rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .tabs button {
          padding: 0.5rem 1rem;
          border: none;
          background: var(--bg-tertiary);
          border-radius: 0.5rem;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .tabs button.active {
          background: var(--accent-color);
          color: white;
        }

        .integrations-content {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .integrations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
        }

        .integration-card {
          background: var(--bg-secondary);
          border-radius: 1rem;
          padding: 1.5rem;
          border: 1px solid var(--border-color);
        }

        .integration-card.connected {
          border-color: var(--success-color);
        }

        .integration-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .integration-icon {
          font-size: 2rem;
        }

        .integration-info h3 {
          margin: 0 0 0.25rem;
        }

        .integration-info p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.connected, .status-badge.active {
          background: var(--success-color-light);
          color: var(--success-color);
        }

        .status-badge.disconnected, .status-badge.inactive {
          background: var(--danger-color-light);
          color: var(--danger-color);
        }

        .integration-features {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 1rem 0;
        }

        .feature-tag {
          background: var(--bg-tertiary);
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
        }

        .sync-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin: 1rem 0;
        }

        .integration-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .connect-button, .sync-button {
          flex: 1;
          padding: 0.75rem;
          border: none;
          border-radius: 0.5rem;
          background: var(--accent-color);
          color: white;
          cursor: pointer;
          font-weight: 600;
        }

        .disconnect-button {
          padding: 0.75rem 1rem;
          border: 1px solid var(--danger-color);
          border-radius: 0.5rem;
          background: transparent;
          color: var(--danger-color);
          cursor: pointer;
        }

        .create-form {
          background: var(--bg-secondary);
          padding: 1.5rem;
          border-radius: 1rem;
          margin-bottom: 2rem;
        }

        .create-form h3 {
          margin: 0 0 1rem;
        }

        .form-row {
          display: flex;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .form-row input[type="text"],
        .form-row input[type="url"] {
          flex: 1;
          min-width: 200px;
          padding: 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .scopes-selector, .events-selector {
          display: flex;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .events-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 0.5rem;
        }

        .apikeys-list, .webhooks-list {
          margin-top: 2rem;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          background: var(--bg-secondary);
          border-radius: 0.5rem;
          overflow: hidden;
        }

        th, td {
          padding: 1rem;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }

        th {
          background: var(--bg-tertiary);
          font-weight: 600;
        }

        tr.inactive {
          opacity: 0.5;
        }

        .webhooks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }

        .webhook-card {
          background: var(--bg-secondary);
          border-radius: 0.5rem;
          padding: 1rem;
          border: 1px solid var(--border-color);
        }

        .webhook-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .webhook-url code {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .webhook-events {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          margin: 0.5rem 0;
        }

        .event-tag {
          background: var(--accent-color-light);
          color: var(--accent-color);
          padding: 0.125rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.7rem;
        }

        .webhook-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .webhook-actions button {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-color);
          border-radius: 0.25rem;
          background: var(--bg-primary);
          cursor: pointer;
        }

        .delete-button {
          color: var(--danger-color);
        }

        .success-banner {
          background: var(--success-color-light);
          color: var(--success-color-dark);
          padding: 1rem 2rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .api-key-display {
          background: var(--bg-primary);
          padding: 0.5rem 1rem;
          border-radius: 0.25rem;
          font-family: monospace;
          word-break: break-all;
        }

        .error-banner {
          background: var(--danger-color-light);
          color: var(--danger-color);
          padding: 1rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-message {
          color: var(--danger-color);
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }

        .empty-message {
          color: var(--text-secondary);
          text-align: center;
          padding: 2rem;
        }

        .failure-count {
          color: var(--warning-color);
          margin-left: 1rem;
        }
      `}</style>
    </div>
  );
}
