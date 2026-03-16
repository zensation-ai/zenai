/**
 * MCPConnectionsPage - MCP Ecosystem Hub (Phase 55 + Phase 71)
 *
 * Settings tab for managing external MCP server connections.
 * Features:
 * - Tab navigation: Servers | Marketplace
 * - Add/edit/remove MCP server configurations
 * - Connect/disconnect to servers
 * - View discovered tools and resources
 * - Health status monitoring
 * - Browse and install community MCP servers (Phase 71)
 */

import { useState, useEffect, useCallback } from 'react';
import type { AIContext } from './ContextSwitcher';
import { ToolMarketplace } from './ToolMarketplace';
import { ServerSetupWizard } from './ServerSetupWizard';
import './MCPConnectionsPage.css';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

// ===========================================
// Types
// ===========================================

interface MCPServer {
  id: string;
  name: string;
  transport: 'streamable-http' | 'stdio' | 'sse';
  url: string | null;
  command: string | null;
  args: string[];
  envVars: Record<string, string>;
  authType: string | null;
  authConfig: Record<string, string>;
  enabled: boolean;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: string | null;
  toolCount: number;
  resourceCount: number;
  errorMessage: string | null;
  connected?: boolean;
  liveHealthy?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

type TransportType = 'streamable-http' | 'stdio' | 'sse';
type MCPTab = 'servers' | 'marketplace';

interface ServerFormData {
  name: string;
  transport: TransportType;
  url: string;
  command: string;
  args: string;
  authType: string;
  authToken: string;
  enabled: boolean;
}

const EMPTY_FORM: ServerFormData = {
  name: '',
  transport: 'streamable-http',
  url: '',
  command: '',
  args: '',
  authType: 'none',
  authToken: '',
  enabled: true,
};

// ===========================================
// API helpers
// ===========================================

function apiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...apiHeaders(), ...options?.headers },
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Anfrage fehlgeschlagen: ${res.status}`);
  }
  return json.data as T;
}

// ===========================================
// Component
// ===========================================

interface MCPConnectionsPageProps {
  context: AIContext;
}

export function MCPConnectionsPage({ context }: MCPConnectionsPageProps) {
  const [activeTab, setActiveTab] = useState<MCPTab>('servers');
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, MCPTool[]>>({});
  const [serverResources, setServerResources] = useState<Record<string, MCPResource[]>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [wizardServerName, setWizardServerName] = useState<string | null>(null);

  // Load servers
  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<MCPServer[]>(`/api/${context}/mcp/servers`);
      setServers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Form handlers
  const openAddForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  };

  const openEditForm = (server: MCPServer) => {
    setForm({
      name: server.name,
      transport: server.transport,
      url: server.url || '',
      command: server.command || '',
      args: server.args.join(' '),
      authType: server.authType || 'none',
      authToken: server.authConfig?.token || '',
      enabled: server.enabled,
    });
    setEditId(server.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        transport: form.transport,
        enabled: form.enabled,
      };

      if (form.transport === 'streamable-http' || form.transport === 'sse') {
        body.url = form.url.trim();
      } else {
        body.command = form.command.trim();
        body.args = form.args.trim() ? form.args.trim().split(/\s+/) : [];
      }

      if (form.authType !== 'none') {
        body.authType = form.authType;
        body.authConfig = { token: form.authToken };
      }

      if (editId) {
        await apiFetch(`/api/${context}/mcp/servers/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/${context}/mcp/servers`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      closeForm();
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server konnte nicht gespeichert werden');
    } finally {
      setSubmitting(false);
    }
  };

  // Server actions
  const connectServer = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/api/${context}/mcp/servers/${id}/connect`, { method: 'POST' });
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const disconnectServer = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/api/${context}/mcp/servers/${id}/disconnect`, { method: 'POST' });
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const deleteServer = async (id: string) => {
    if (!window.confirm('MCP Server wirklich entfernen?')) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/api/${context}/mcp/servers/${id}`, { method: 'DELETE' });
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const healthCheck = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/api/${context}/mcp/servers/${id}/health`);
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  // Toggle expand and load tools/resources
  const toggleExpand = async (id: string) => {
    if (expandedServer === id) {
      setExpandedServer(null);
      return;
    }

    setExpandedServer(id);

    // Load tools if not cached
    if (!serverTools[id]) {
      try {
        const data = await apiFetch<{ tools: MCPTool[] }>(`/api/${context}/mcp/servers/${id}/tools`);
        setServerTools(prev => ({ ...prev, [id]: data.tools || [] }));
      } catch {
        setServerTools(prev => ({ ...prev, [id]: [] }));
      }
    }

    // Load resources if not cached
    if (!serverResources[id]) {
      try {
        const data = await apiFetch<{ resources: MCPResource[] }>(`/api/${context}/mcp/servers/${id}/resources`);
        setServerResources(prev => ({ ...prev, [id]: data.resources || [] }));
      } catch {
        setServerResources(prev => ({ ...prev, [id]: [] }));
      }
    }
  };

  // Marketplace install handler
  const handleMarketplaceInstall = (serverName: string) => {
    setWizardServerName(serverName);
  };

  const handleWizardComplete = () => {
    setWizardServerName(null);
    setActiveTab('servers');
    loadServers();
  };

  const handleWizardCancel = () => {
    setWizardServerName(null);
  };

  // Status helpers
  const getStatusBadge = (server: MCPServer) => {
    if (server.connected || server.liveHealthy) {
      return <span className="mcp-status mcp-status--healthy">Verbunden</span>;
    }
    if (server.healthStatus === 'unhealthy') {
      return <span className="mcp-status mcp-status--unhealthy">Fehler</span>;
    }
    return <span className="mcp-status mcp-status--unknown">Offline</span>;
  };

  const getTransportLabel = (t: TransportType) => {
    switch (t) {
      case 'streamable-http': return 'HTTP';
      case 'stdio': return 'Stdio';
      case 'sse': return 'SSE';
      default: return t;
    }
  };

  // ===========================================
  // Render
  // ===========================================

  // Show wizard overlay
  if (wizardServerName) {
    return (
      <div className="mcp-connections-page">
        <ServerSetupWizard
          context={context}
          serverName={wizardServerName}
          onComplete={handleWizardComplete}
          onCancel={handleWizardCancel}
        />
      </div>
    );
  }

  return (
    <div className="mcp-connections-page">
      <div className="mcp-header">
        <div className="mcp-header-text">
          <h3>MCP Ecosystem Hub</h3>
          <p className="mcp-subtitle">
            Externe MCP-Server verbinden, um deren Tools und Ressourcen in ZenAI zu nutzen.
          </p>
        </div>
        {activeTab === 'servers' && (
          <button className="mcp-btn mcp-btn--primary" onClick={openAddForm}>
            + Server hinzufuegen
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="mcp-tabs">
        <button
          className={`mcp-tab ${activeTab === 'servers' ? 'mcp-tab--active' : ''}`}
          onClick={() => setActiveTab('servers')}
        >
          Server ({servers.length})
        </button>
        <button
          className={`mcp-tab ${activeTab === 'marketplace' ? 'mcp-tab--active' : ''}`}
          onClick={() => setActiveTab('marketplace')}
        >
          Marketplace
        </button>
      </div>

      {/* Marketplace Tab */}
      {activeTab === 'marketplace' && (
        <ToolMarketplace
          context={context}
          installedServers={servers.map(s => ({
            id: s.id,
            name: s.name,
            connected: s.connected,
            liveHealthy: s.liveHealthy,
          }))}
          onInstall={handleMarketplaceInstall}
        />
      )}

      {/* Servers Tab */}
      {activeTab === 'servers' && (
        <>
          {/* Ecosystem Health Summary */}
          {!loading && servers.length > 0 && (
            <div className="mcp-ecosystem-summary">
              <div className="mcp-summary-stat">
                <span className="mcp-summary-value">{servers.length}</span>
                <span className="mcp-summary-label">Server</span>
              </div>
              <div className="mcp-summary-stat">
                <span className="mcp-summary-value mcp-summary--healthy">
                  {servers.filter(s => s.healthStatus === 'healthy').length}
                </span>
                <span className="mcp-summary-label">Healthy</span>
              </div>
              <div className="mcp-summary-stat">
                <span className="mcp-summary-value">
                  {servers.reduce((sum, s) => sum + (s.toolCount || 0), 0)}
                </span>
                <span className="mcp-summary-label">Tools</span>
              </div>
              <div className="mcp-summary-stat">
                <span className="mcp-summary-value">
                  {servers.reduce((sum, s) => sum + (s.resourceCount || 0), 0)}
                </span>
                <span className="mcp-summary-label">Resources</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mcp-error" role="alert">
              <span>{error}</span>
              <button className="mcp-error-dismiss" onClick={() => setError(null)} aria-label="Fehler schliessen">
                x
              </button>
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <div className="mcp-form-card">
              <h4>{editId ? 'Server bearbeiten' : 'Neuen MCP Server hinzufuegen'}</h4>

              <div className="mcp-form-grid">
                <div className="mcp-form-group">
                  <label htmlFor="mcp-name">Name</label>
                  <input
                    id="mcp-name"
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="z.B. GitHub MCP, Notion MCP"
                    className="mcp-input"
                  />
                </div>

                <div className="mcp-form-group">
                  <label htmlFor="mcp-transport">Transport</label>
                  <select
                    id="mcp-transport"
                    value={form.transport}
                    onChange={e => setForm(f => ({ ...f, transport: e.target.value as TransportType }))}
                    className="mcp-input"
                  >
                    <option value="streamable-http">Streamable HTTP</option>
                    <option value="sse">SSE (Server-Sent Events)</option>
                    <option value="stdio">Stdio (lokaler Prozess)</option>
                  </select>
                </div>

                {(form.transport === 'streamable-http' || form.transport === 'sse') && (
                  <div className="mcp-form-group mcp-form-group--wide">
                    <label htmlFor="mcp-url">Server URL</label>
                    <input
                      id="mcp-url"
                      type="url"
                      value={form.url}
                      onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                      placeholder="https://mcp-server.example.com"
                      className="mcp-input"
                    />
                  </div>
                )}

                {form.transport === 'stdio' && (
                  <>
                    <div className="mcp-form-group">
                      <label htmlFor="mcp-command">Befehl</label>
                      <input
                        id="mcp-command"
                        type="text"
                        value={form.command}
                        onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
                        placeholder="npx, node, python"
                        className="mcp-input"
                      />
                    </div>
                    <div className="mcp-form-group">
                      <label htmlFor="mcp-args">Argumente</label>
                      <input
                        id="mcp-args"
                        type="text"
                        value={form.args}
                        onChange={e => setForm(f => ({ ...f, args: e.target.value }))}
                        placeholder="--port 3001 --verbose"
                        className="mcp-input"
                      />
                    </div>
                  </>
                )}

                <div className="mcp-form-group">
                  <label htmlFor="mcp-auth">Authentifizierung</label>
                  <select
                    id="mcp-auth"
                    value={form.authType}
                    onChange={e => setForm(f => ({ ...f, authType: e.target.value }))}
                    className="mcp-input"
                  >
                    <option value="none">Keine</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="api-key">API Key</option>
                  </select>
                </div>

                {form.authType !== 'none' && (
                  <div className="mcp-form-group">
                    <label htmlFor="mcp-token">Token / API Key</label>
                    <input
                      id="mcp-token"
                      type="password"
                      value={form.authToken}
                      onChange={e => setForm(f => ({ ...f, authToken: e.target.value }))}
                      placeholder="sk-..."
                      className="mcp-input"
                    />
                  </div>
                )}

                <div className="mcp-form-group mcp-form-group--checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
                    />
                    Aktiviert
                  </label>
                </div>
              </div>

              <div className="mcp-form-actions">
                <button className="mcp-btn mcp-btn--secondary" onClick={closeForm} disabled={submitting}>
                  Abbrechen
                </button>
                <button
                  className="mcp-btn mcp-btn--primary"
                  onClick={handleSubmit}
                  disabled={submitting || !form.name.trim()}
                >
                  {submitting ? 'Speichern...' : editId ? 'Aktualisieren' : 'Hinzufuegen'}
                </button>
              </div>
            </div>
          )}

          {/* Server List */}
          {loading ? (
            <div className="mcp-loading">Lade Server...</div>
          ) : servers.length === 0 ? (
            <div className="mcp-empty">
              <div className="mcp-empty-icon">MCP</div>
              <h4>Keine MCP Server konfiguriert</h4>
              <p>Fuege einen externen MCP Server hinzu oder besuche den Marketplace.</p>
              <button
                className="mcp-btn mcp-btn--primary"
                style={{ marginTop: '0.75rem' }}
                onClick={() => setActiveTab('marketplace')}
              >
                Marketplace oeffnen
              </button>
            </div>
          ) : (
            <div className="mcp-server-list">
              {servers.map(server => (
                <div key={server.id} className={`mcp-server-card ${expandedServer === server.id ? 'mcp-server-card--expanded' : ''}`}>
                  <div className="mcp-server-header" onClick={() => toggleExpand(server.id)}>
                    <div className="mcp-server-info">
                      <div className="mcp-server-name">
                        {server.name}
                        {getStatusBadge(server)}
                        <span className="mcp-transport-badge">{getTransportLabel(server.transport)}</span>
                      </div>
                      <div className="mcp-server-meta">
                        {server.url && <span className="mcp-meta-item">{server.url}</span>}
                        {server.command && <span className="mcp-meta-item">{server.command} {server.args.join(' ')}</span>}
                        {server.toolCount > 0 && <span className="mcp-meta-item">{server.toolCount} Tools</span>}
                        {server.resourceCount > 0 && <span className="mcp-meta-item">{server.resourceCount} Ressourcen</span>}
                      </div>
                      {server.errorMessage && (
                        <div className="mcp-server-error">{server.errorMessage}</div>
                      )}
                    </div>
                    <div className="mcp-server-actions" onClick={e => e.stopPropagation()}>
                      {server.connected ? (
                        <button
                          className="mcp-btn mcp-btn--small mcp-btn--warning"
                          onClick={() => disconnectServer(server.id)}
                          disabled={actionLoading[server.id]}
                          title="Trennen"
                        >
                          Trennen
                        </button>
                      ) : (
                        <button
                          className="mcp-btn mcp-btn--small mcp-btn--success"
                          onClick={() => connectServer(server.id)}
                          disabled={actionLoading[server.id]}
                          title="Verbinden"
                        >
                          Verbinden
                        </button>
                      )}
                      <button
                        className="mcp-btn mcp-btn--small"
                        onClick={() => healthCheck(server.id)}
                        disabled={actionLoading[server.id]}
                        title="Health Check"
                      >
                        Pruefen
                      </button>
                      <button
                        className="mcp-btn mcp-btn--small"
                        onClick={() => openEditForm(server)}
                        title="Bearbeiten"
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="mcp-btn mcp-btn--small mcp-btn--danger"
                        onClick={() => deleteServer(server.id)}
                        disabled={actionLoading[server.id]}
                        title="Entfernen"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>

                  {/* Expanded: Tools & Resources */}
                  {expandedServer === server.id && (
                    <div className="mcp-server-details">
                      <div className="mcp-details-section">
                        <h5>Tools ({serverTools[server.id]?.length || 0})</h5>
                        {(serverTools[server.id] || []).length === 0 ? (
                          <p className="mcp-details-empty">Keine Tools verfuegbar</p>
                        ) : (
                          <div className="mcp-tools-grid">
                            {(serverTools[server.id] || []).map(tool => (
                              <div key={tool.name} className="mcp-tool-card">
                                <div className="mcp-tool-name">{tool.name}</div>
                                {tool.description && (
                                  <div className="mcp-tool-desc">{tool.description}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mcp-details-section">
                        <h5>Ressourcen ({serverResources[server.id]?.length || 0})</h5>
                        {(serverResources[server.id] || []).length === 0 ? (
                          <p className="mcp-details-empty">Keine Ressourcen verfuegbar</p>
                        ) : (
                          <div className="mcp-resources-list">
                            {(serverResources[server.id] || []).map(resource => (
                              <div key={resource.uri} className="mcp-resource-item">
                                <span className="mcp-resource-name">{resource.name}</span>
                                <span className="mcp-resource-uri">{resource.uri}</span>
                                {resource.description && (
                                  <span className="mcp-resource-desc">{resource.description}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MCPConnectionsPage;
