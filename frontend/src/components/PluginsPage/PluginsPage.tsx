/**
 * PluginsPage Component
 *
 * Main plugin management page with 2 tabs: Installiert (installed) and Marketplace.
 * Provides plugin lifecycle management: install, activate, deactivate, configure, uninstall.
 *
 * Phase 51 - Plugin & Extension System
 */

import { useState, useEffect, useCallback } from 'react';
import { PluginConfigModal } from './PluginConfigModal';
import './PluginsPage.css';

// Types
interface PluginInstance {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  status: string;
  config: Record<string, unknown>;
  permissions: string[];
  installedAt: string;
  updatedAt: string;
  errorMessage?: string;
}

interface MarketplacePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: string[];
}

type TabId = 'installed' | 'marketplace';
type ContextId = 'personal' | 'work' | 'learning' | 'creative';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

export default function PluginsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('installed');
  const [context, setContext] = useState<ContextId>('personal');
  const [installedPlugins, setInstalledPlugins] = useState<PluginInstance[]>([]);
  const [marketplacePlugins, setMarketplacePlugins] = useState<MarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configPlugin, setConfigPlugin] = useState<PluginInstance | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchInstalled = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/${context}/plugins`, { headers });
      if (!res.ok) throw new Error(`Failed to load plugins: ${res.status}`);
      const json = await res.json();
      setInstalledPlugins(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load installed plugins');
    } finally {
      setLoading(false);
    }
  }, [context]);

  const fetchMarketplace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/${context}/plugins/marketplace`, { headers });
      if (!res.ok) throw new Error(`Failed to load marketplace: ${res.status}`);
      const json = await res.json();
      setMarketplacePlugins(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    if (activeTab === 'installed') {
      fetchInstalled();
    } else {
      fetchMarketplace();
    }
  }, [activeTab, context, fetchInstalled, fetchMarketplace]);

  const handleInstall = async (plugin: MarketplacePlugin) => {
    setInstallingId(plugin.id);
    try {
      const manifest = {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        author: plugin.author,
        permissions: plugin.permissions,
        entryPoints: [],
      };
      const res = await fetch(`${API_BASE}/api/${context}/plugins`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ manifest }),
      });
      if (!res.ok) throw new Error(`Install failed: ${res.status}`);
      await fetchInstalled();
      setActiveTab('installed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install plugin');
    } finally {
      setInstallingId(null);
    }
  };

  const handleToggleActive = async (plugin: PluginInstance) => {
    setTogglingId(plugin.pluginId);
    try {
      const action = plugin.status === 'active' ? 'deactivate' : 'activate';
      const res = await fetch(`${API_BASE}/api/${context}/plugins/${plugin.pluginId}/${action}`, {
        method: 'PUT',
        headers,
      });
      if (!res.ok) throw new Error(`${action} failed: ${res.status}`);
      await fetchInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle plugin');
    } finally {
      setTogglingId(null);
    }
  };

  const handleUninstall = async (pluginId: string) => {
    if (!confirm('Plugin wirklich deinstallieren?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/${context}/plugins/${pluginId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error(`Uninstall failed: ${res.status}`);
      await fetchInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall plugin');
    }
  };

  const handleSaveConfig = async (pluginId: string, config: Record<string, unknown>) => {
    try {
      const res = await fetch(`${API_BASE}/api/${context}/plugins/${pluginId}/config`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error(`Config update failed: ${res.status}`);
      setConfigPlugin(null);
      await fetchInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active': return 'plugins-status-badge plugins-status-active';
      case 'inactive': return 'plugins-status-badge plugins-status-inactive';
      case 'error': return 'plugins-status-badge plugins-status-error';
      case 'installing': return 'plugins-status-badge plugins-status-installing';
      default: return 'plugins-status-badge';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Aktiv';
      case 'inactive': return 'Inaktiv';
      case 'error': return 'Fehler';
      case 'installing': return 'Installiert...';
      default: return status;
    }
  };

  return (
    <div className="plugins-page">
      <div className="plugins-header">
        <h1>Plugins</h1>
        <select
          className="plugins-context-select"
          value={context}
          onChange={(e) => setContext(e.target.value as ContextId)}
        >
          <option value="personal">Personal</option>
          <option value="work">Work</option>
          <option value="learning">Learning</option>
          <option value="creative">Creative</option>
        </select>
      </div>

      <div className="plugins-tabs">
        <button
          className={`plugins-tab ${activeTab === 'installed' ? 'plugins-tab-active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          Installiert
          {installedPlugins.length > 0 && (
            <span className="plugins-tab-count">{installedPlugins.length}</span>
          )}
        </button>
        <button
          className={`plugins-tab ${activeTab === 'marketplace' ? 'plugins-tab-active' : ''}`}
          onClick={() => setActiveTab('marketplace')}
        >
          Marketplace
        </button>
      </div>

      {error && (
        <div className="plugins-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {loading && (
        <div className="plugins-loading">
          <div className="plugins-spinner" />
          <span>Laden...</span>
        </div>
      )}

      {!loading && activeTab === 'installed' && (
        <div className="plugins-installed-list">
          {installedPlugins.length === 0 ? (
            <div className="plugins-empty">
              <p>Keine Plugins installiert.</p>
              <button className="plugins-btn-primary" onClick={() => setActiveTab('marketplace')}>
                Marketplace durchsuchen
              </button>
            </div>
          ) : (
            installedPlugins.map((plugin) => (
              <div key={plugin.id} className="plugins-card">
                <div className="plugins-card-header">
                  <div className="plugins-card-info">
                    <h3 className="plugins-card-name">{plugin.name}</h3>
                    <span className="plugins-card-version">v{plugin.version}</span>
                    <span className={getStatusBadgeClass(plugin.status)}>
                      {getStatusLabel(plugin.status)}
                    </span>
                  </div>
                  <div className="plugins-card-actions">
                    <button
                      className={`plugins-toggle ${plugin.status === 'active' ? 'plugins-toggle-on' : ''}`}
                      onClick={() => handleToggleActive(plugin)}
                      disabled={togglingId === plugin.pluginId || plugin.status === 'error'}
                      title={plugin.status === 'active' ? 'Deaktivieren' : 'Aktivieren'}
                    >
                      <span className="plugins-toggle-track">
                        <span className="plugins-toggle-thumb" />
                      </span>
                    </button>
                    <button
                      className="plugins-btn-icon"
                      onClick={() => setConfigPlugin(plugin)}
                      title="Konfigurieren"
                    >
                      &#9881;
                    </button>
                    <button
                      className="plugins-btn-icon plugins-btn-danger"
                      onClick={() => handleUninstall(plugin.pluginId)}
                      title="Deinstallieren"
                    >
                      &#128465;
                    </button>
                  </div>
                </div>
                {plugin.errorMessage && (
                  <div className="plugins-card-error">{plugin.errorMessage}</div>
                )}
                {plugin.permissions.length > 0 && (
                  <div className="plugins-card-permissions">
                    {plugin.permissions.map((perm) => (
                      <span key={perm} className="plugins-permission-badge">{perm}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && activeTab === 'marketplace' && (
        <div className="plugins-marketplace-grid">
          {marketplacePlugins.length === 0 ? (
            <div className="plugins-empty">
              <p>Keine Plugins im Marketplace verfuegbar.</p>
            </div>
          ) : (
            marketplacePlugins.map((plugin) => (
              <div key={plugin.id} className="plugins-marketplace-card">
                <div className="plugins-marketplace-card-header">
                  <h3 className="plugins-card-name">{plugin.name}</h3>
                  <span className="plugins-card-version">v{plugin.version}</span>
                </div>
                <p className="plugins-marketplace-description">{plugin.description}</p>
                <p className="plugins-marketplace-author">von {plugin.author}</p>
                {plugin.permissions.length > 0 && (
                  <div className="plugins-card-permissions">
                    {plugin.permissions.map((perm) => (
                      <span key={perm} className="plugins-permission-badge">{perm}</span>
                    ))}
                  </div>
                )}
                <button
                  className="plugins-btn-primary plugins-install-btn"
                  onClick={() => handleInstall(plugin)}
                  disabled={installingId === plugin.id}
                >
                  {installingId === plugin.id ? 'Installiert...' : 'Installieren'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {configPlugin && (
        <PluginConfigModal
          plugin={configPlugin}
          onSave={(config) => handleSaveConfig(configPlugin.pluginId, config)}
          onClose={() => setConfigPlugin(null)}
        />
      )}
    </div>
  );
}
