/**
 * Phase 4: Integrations Dashboard
 * Manage external integrations (Microsoft, Slack, Webhooks, API Keys)
 */

import { useState, useEffect } from 'react';
import axios from 'axios';

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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const connectIntegration = async (provider: string) => {
    try {
      const response = await axios.get(`/api/integrations/${provider}/auth`);
      window.location.href = response.data.authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to connect ${provider}`);
    }
  };

  const disconnectIntegration = async (provider: string) => {
    if (!confirm(`${provider} wirklich trennen?`)) return;
    try {
      await axios.delete(`/api/integrations/${provider}`);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to disconnect');
    }
  };

  const syncIntegration = async (provider: string) => {
    try {
      setIntegrations(prev => prev.map(i =>
        i.provider === provider ? { ...i, syncStatus: 'syncing' as const } : i
      ));
      await axios.post(`/api/integrations/${provider}/sync`);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Sync failed');
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
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create API key');
    }
  };

  const deleteApiKey = async (id: string) => {
    if (!confirm('API Key wirklich löschen?')) return;
    try {
      await axios.delete(`/api/keys/${id}`);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete API key');
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
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create webhook');
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!confirm('Webhook wirklich löschen?')) return;
    try {
      await axios.delete(`/api/webhooks/${id}`);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete webhook');
    }
  };

  const testWebhook = async (id: string) => {
    try {
      await axios.post(`/api/webhooks/${id}/test`);
      alert('Test-Webhook gesendet!');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Test failed');
    }
  };

  const availableEvents = [
    'idea.created', 'idea.updated', 'idea.deleted', 'idea.archived',
    'meeting.created', 'meeting.updated', 'meeting.completed',
    'calendar.synced', 'slack.message_processed'
  ];

  if (loading) {
    return (
      <div className="page integrations-page">
        <header className="page-header">
          <button className="back-button" onClick={onBack}>← Zurück</button>
          <h1>⚙️ Integrationen</h1>
        </header>
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Integrationen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page integrations-page">
      <header className="page-header">
        <button className="back-button" onClick={onBack}>← Zurück</button>
        <h1>⚙️ Integrationen</h1>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {createdKey && (
        <div className="success-banner">
          <strong>API Key erstellt! Kopiere diesen Key jetzt - er wird nicht wieder angezeigt:</strong>
          <code className="api-key-display">{createdKey}</code>
          <button onClick={() => {
            navigator.clipboard.writeText(createdKey);
            alert('Kopiert!');
          }}>📋 Kopieren</button>
          <button onClick={() => setCreatedKey(null)}>×</button>
        </div>
      )}

      <div className="tabs">
        <button
          className={activeTab === 'integrations' ? 'active' : ''}
          onClick={() => setActiveTab('integrations')}
        >
          🔗 Integrationen
        </button>
        <button
          className={activeTab === 'apikeys' ? 'active' : ''}
          onClick={() => setActiveTab('apikeys')}
        >
          🔑 API Keys
        </button>
        <button
          className={activeTab === 'webhooks' ? 'active' : ''}
          onClick={() => setActiveTab('webhooks')}
        >
          🪝 Webhooks
        </button>
      </div>

      <main className="integrations-content">
        {activeTab === 'integrations' && (
          <div className="integrations-grid">
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
                        className="sync-button"
                        onClick={() => syncIntegration(integration.provider)}
                        disabled={integration.syncStatus === 'syncing'}
                      >
                        {integration.syncStatus === 'syncing' ? 'Sync läuft...' : '🔄 Jetzt synchronisieren'}
                      </button>
                      <button
                        className="disconnect-button"
                        onClick={() => disconnectIntegration(integration.provider)}
                      >
                        Trennen
                      </button>
                    </>
                  ) : (
                    <button
                      className="connect-button"
                      onClick={() => connectIntegration(integration.provider)}
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
                <button onClick={createApiKey} disabled={!newKeyName.trim()}>
                  + Erstellen
                </button>
              </div>
            </div>

            <div className="apikeys-list">
              <h3>Vorhandene API Keys</h3>
              {apiKeys.length === 0 ? (
                <p className="empty-message">Noch keine API Keys erstellt.</p>
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
                          <button className="delete-button" onClick={() => deleteApiKey(key.id)}>
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
                onClick={createWebhook}
                disabled={!newWebhookName.trim() || !newWebhookUrl.trim()}
              >
                + Webhook erstellen
              </button>
            </div>

            <div className="webhooks-list">
              <h3>Aktive Webhooks</h3>
              {webhooks.length === 0 ? (
                <p className="empty-message">Noch keine Webhooks konfiguriert.</p>
              ) : (
                <div className="webhooks-grid">
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
                        <button onClick={() => testWebhook(webhook.id)}>🧪 Testen</button>
                        <button className="delete-button" onClick={() => deleteWebhook(webhook.id)}>🗑️</button>
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
        .integrations-page {
          min-height: 100vh;
          background: var(--bg-primary);
        }

        .page-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 2rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .back-button {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 1rem;
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
