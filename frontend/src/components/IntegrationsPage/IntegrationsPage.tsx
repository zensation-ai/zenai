/**
 * Phase 4: Integrations Dashboard
 * Manage external integrations (Microsoft, Slack, Webhooks, API Keys)
 */

import { useState, useEffect } from 'react';
import axios from 'axios';
import { showToast } from '../Toast';
import { useConfirm } from '../ConfirmDialog';
import { getRandomReward } from '../../utils/aiPersonality';
import '../../neurodesign.css';
import { logError } from '../../utils/errors';
import './IntegrationsPage.css';

import type { Integration, ApiKey, Webhook, IntegrationsPageProps } from './types';
import { getErrorMessage } from './types';
import { IntegrationsTab } from './IntegrationsTab';
import { ApiKeysTab } from './ApiKeysTab';
import { WebhooksTab } from './WebhooksTab';
import { MCPHubTab } from './MCPHubTab';
import { MCPServerTab } from './MCPServerTab';

export function IntegrationsPage({ onBack, embedded }: IntegrationsPageProps) {
  const [activeTab, setActiveTab] = useState<'integrations' | 'apikeys' | 'webhooks' | 'mcp' | 'mcp-server'>('integrations');
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
      setError(getErrorMessage(err, 'Die Integrationsdaten konnten gerade nicht geladen werden. Versuch es gleich noch mal.'));
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
          logError('IntegrationsPage:oauthDomainCheck', new Error(`OAuth URL domain not in whitelist: ${url.hostname}`));
          setError(`Sicherheitsfehler: Ungültige OAuth-URL für ${provider}`);
          return;
        }

        window.location.href = authUrl;
      } catch {
        logError('IntegrationsPage:invalidOAuthUrl', new Error(`Invalid OAuth URL received: ${authUrl}`));
        setError(`Ungültige OAuth-URL für ${provider}`);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, `Die Verbindung zu ${provider} konnte nicht hergestellt werden. Prüf deine Netzwerkverbindung.`));
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
      setError(getErrorMessage(err, 'Die Integration konnte nicht getrennt werden. Versuch es gleich noch mal.'));
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
      setError(getErrorMessage(err, 'Die Synchronisation konnte nicht gestartet werden. Versuch es gleich noch mal.'));
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
      setError(getErrorMessage(err, 'Der API Key konnte nicht erstellt werden. Prüf die Eingaben und versuch es noch mal.'));
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
      setError(getErrorMessage(err, 'Der API Key konnte nicht gelöscht werden. Versuch es gleich noch mal.'));
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
      setError(getErrorMessage(err, 'Der Webhook konnte nicht erstellt werden. Prüf die URL und versuch es noch mal.'));
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
      setError(getErrorMessage(err, 'Der Webhook konnte nicht gelöscht werden. Versuch es gleich noch mal.'));
    }
  };

  const testWebhook = async (id: string) => {
    try {
      await axios.post(`/api/webhooks/${id}/test`);
      showToast('Test-Webhook gesendet!', 'success');
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Der Webhook-Test hat nicht geklappt. Prüf die URL und versuch es noch mal.'), 'error');
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
        {!embedded && (
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
        )}
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
      {!embedded && (
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
      )}

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
        <button
          type="button"
          className={`neuro-press-effect ${activeTab === 'mcp' ? 'active' : ''}`}
          onClick={() => setActiveTab('mcp')}
          aria-current={activeTab === 'mcp' ? 'true' : undefined}
        >
          🔧 MCP Hub
        </button>
        <button
          type="button"
          className={`neuro-press-effect ${activeTab === 'mcp-server' ? 'active' : ''}`}
          onClick={() => setActiveTab('mcp-server')}
          aria-current={activeTab === 'mcp-server' ? 'true' : undefined}
        >
          🌐 MCP Server
        </button>
      </div>

      <main className="integrations-content">
        {activeTab === 'integrations' && (
          <IntegrationsTab
            integrations={integrations}
            connectIntegration={connectIntegration}
            disconnectIntegration={disconnectIntegration}
            syncIntegration={syncIntegration}
          />
        )}

        {activeTab === 'apikeys' && (
          <ApiKeysTab
            apiKeys={apiKeys}
            newKeyName={newKeyName}
            setNewKeyName={setNewKeyName}
            newKeyScopes={newKeyScopes}
            setNewKeyScopes={setNewKeyScopes}
            createApiKey={createApiKey}
            deleteApiKey={deleteApiKey}
          />
        )}

        {activeTab === 'webhooks' && (
          <WebhooksTab
            webhooks={webhooks}
            newWebhookName={newWebhookName}
            setNewWebhookName={setNewWebhookName}
            newWebhookUrl={newWebhookUrl}
            setNewWebhookUrl={setNewWebhookUrl}
            newWebhookEvents={newWebhookEvents}
            setNewWebhookEvents={setNewWebhookEvents}
            availableEvents={availableEvents}
            createWebhook={createWebhook}
            deleteWebhook={deleteWebhook}
            testWebhook={testWebhook}
          />
        )}

        {activeTab === 'mcp' && <MCPHubTab />}

        {activeTab === 'mcp-server' && <MCPServerTab />}
      </main>
    </div>
  );
}
