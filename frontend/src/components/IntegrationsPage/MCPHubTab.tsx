/**
 * Phase 44: MCP Hub Tab - Enhanced
 *
 * Shows internal MCP tools + external MCP server connection management.
 * Two sections:
 * 1. Internal Tools: 30 built-in MCP tools grouped by domain
 * 2. External Connections: Manage connections to external MCP servers
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { showToast } from '../Toast';
import { logError } from '../../utils/errors';

// ===========================================
// Types
// ===========================================

interface MCPToolInfo {
  name: string;
  description: string;
  category: string;
  icon: string;
}

interface MCPConnection {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  toolCount: number;
  resourceCount: number;
  lastHealthCheck: string | null;
  errorMessage: string | null;
  enabled: boolean;
  createdAt: string;
}

interface MCPHubTabProps {
  context?: string;
}

// ===========================================
// Built-in Tool Definitions
// ===========================================

const MCP_TOOLS: MCPToolInfo[] = [
  // Ideas & Knowledge
  { name: 'create_idea', description: 'Neue Idee strukturieren & speichern', category: 'Ideen', icon: '💡' },
  { name: 'search_ideas', description: 'Semantische Suche durch Ideen', category: 'Ideen', icon: '🔍' },
  { name: 'get_related_ideas', description: 'Verwandte Ideen via Knowledge Graph', category: 'Ideen', icon: '🔗' },
  { name: 'deep_search', description: 'HyDE + Re-Ranking Tiefensuche', category: 'Ideen', icon: '🔬' },
  { name: 'find_contradictions', description: 'Duplikate & Widersprueche finden', category: 'Ideen', icon: '⚡' },
  { name: 'synthesize_knowledge', description: 'Multi-Quellen Wissens-Synthese', category: 'Ideen', icon: '🧬' },

  // AI & Analysis
  { name: 'chat', description: 'Personalisierter KI-Chat', category: 'KI', icon: '💬' },
  { name: 'deep_analysis', description: 'Extended Thinking Tiefenanalyse', category: 'KI', icon: '🧠' },
  { name: 'generate_draft', description: 'Strukturierte Entwuerfe generieren', category: 'KI', icon: '📝' },
  { name: 'query_memory', description: '4-Schicht-Gedaechtnis abfragen', category: 'KI', icon: '💾' },
  { name: 'explore_connections', description: 'Graph-Exploration & Cluster', category: 'KI', icon: '🌐' },

  // Productivity & Compliance
  { name: 'get_suggestions', description: 'Proaktive KI-Vorschlaege', category: 'Produktivitaet', icon: '✨' },
  { name: 'get_stats', description: 'Brain-Statistiken abrufen', category: 'Produktivitaet', icon: '📊' },
  { name: 'productivity_report', description: 'AI-ROI & Zeitersparnis', category: 'Produktivitaet', icon: '📈' },
  { name: 'active_recall_quiz', description: 'Spaced-Repetition Lernquiz', category: 'Produktivitaet', icon: '🎯' },
  { name: 'compliance_check', description: 'EU AI Act Compliance-Status', category: 'Produktivitaet', icon: '🛡️' },

  // Contacts
  { name: 'search_contacts', description: 'Kontakte nach Name/Email suchen', category: 'Kontakte', icon: '👤' },
  { name: 'get_contact_timeline', description: 'Interaktions-Timeline eines Kontakts', category: 'Kontakte', icon: '📅' },
  { name: 'contact_follow_ups', description: 'Follow-up-Empfehlungen', category: 'Kontakte', icon: '📞' },
  { name: 'contact_stats', description: 'Kontakt-Statistiken', category: 'Kontakte', icon: '📊' },

  // Finance
  { name: 'financial_overview', description: 'Einnahmen, Ausgaben & Trends', category: 'Finanzen', icon: '💰' },
  { name: 'get_transactions', description: 'Transaktionen filtern & auflisten', category: 'Finanzen', icon: '💳' },
  { name: 'budget_status', description: 'Budget-Fortschritt & Limits', category: 'Finanzen', icon: '📊' },
  { name: 'expense_categories', description: 'Ausgaben nach Kategorien', category: 'Finanzen', icon: '🏷️' },

  // Screen Memory
  { name: 'search_screen_memory', description: 'OCR-Text & Apps durchsuchen', category: 'Screen Memory', icon: '🖥️' },
  { name: 'screen_memory_stats', description: 'Aufzeichnungs-Statistiken', category: 'Screen Memory', icon: '📊' },

  // Proactive Intelligence
  { name: 'morning_briefing', description: 'KI-Morgen-Briefing generieren', category: 'Proaktiv', icon: '☀️' },
  { name: 'smart_schedule', description: 'Optimierter Tagesplan', category: 'Proaktiv', icon: '📋' },
  { name: 'proactive_follow_ups', description: 'Proaktive Follow-up-Vorschlaege', category: 'Proaktiv', icon: '🔔' },
  { name: 'workflow_patterns', description: 'Erkannte Arbeitsablauf-Muster', category: 'Proaktiv', icon: '🔄' },
];

const CATEGORIES = [
  { id: 'all', label: 'Alle', icon: '🔧' },
  { id: 'Ideen', label: 'Ideen', icon: '💡' },
  { id: 'KI', label: 'KI', icon: '🧠' },
  { id: 'Produktivitaet', label: 'Produktivitaet', icon: '📈' },
  { id: 'Kontakte', label: 'Kontakte', icon: '👥' },
  { id: 'Finanzen', label: 'Finanzen', icon: '💰' },
  { id: 'Screen Memory', label: 'Screen Memory', icon: '🖥️' },
  { id: 'Proaktiv', label: 'Proaktiv', icon: '✨' },
];

// ===========================================
// Status Badge Component
// ===========================================

function StatusBadge({ status }: { status: MCPConnection['status'] }) {
  const config = {
    connected: { label: 'Verbunden', className: 'mcp-status-connected' },
    disconnected: { label: 'Getrennt', className: 'mcp-status-disconnected' },
    error: { label: 'Fehler', className: 'mcp-status-error' },
    pending: { label: 'Warte...', className: 'mcp-status-pending' },
  };
  const { label, className } = config[status] || config.pending;
  return <span className={`mcp-status-badge ${className}`}>{label}</span>;
}

// ===========================================
// MCPHubTab Component
// ===========================================

export function MCPHubTab({ context = 'personal' }: MCPHubTabProps) {
  const [section, setSection] = useState<'tools' | 'connections'>('tools');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // External connections state
  const [connections, setConnections] = useState<MCPConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const res = await axios.get(`/api/${context}/mcp/connections`);
      setConnections(res.data.data || []);
    } catch (err) {
      logError(err, 'MCPHubTab.loadConnections');
    } finally {
      setLoadingConnections(false);
    }
  }, [context]);

  useEffect(() => {
    if (section === 'connections') {
      loadConnections();
    }
  }, [section, loadConnections]);

  const addConnection = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    try {
      await axios.post(`/api/${context}/mcp/connections`, {
        name: newName.trim(),
        url: newUrl.trim(),
        apiKey: newApiKey.trim() || undefined,
      });
      showToast('MCP-Server hinzugefuegt', 'success');
      setNewName('');
      setNewUrl('');
      setNewApiKey('');
      setShowAddForm(false);
      loadConnections();
    } catch (err) {
      logError(err, 'MCPHubTab.addConnection');
      showToast('Fehler beim Hinzufuegen', 'error');
    }
  };

  const deleteConnection = async (id: string) => {
    try {
      await axios.delete(`/api/${context}/mcp/connections/${id}`);
      showToast('Verbindung entfernt', 'success');
      loadConnections();
    } catch (err) {
      logError(err, 'MCPHubTab.deleteConnection');
      showToast('Fehler beim Entfernen', 'error');
    }
  };

  const checkConnection = async (id: string) => {
    try {
      await axios.post(`/api/${context}/mcp/connections/${id}/check`);
      showToast('Verbindungstest durchgefuehrt', 'success');
      loadConnections();
    } catch (err) {
      logError(err, 'MCPHubTab.checkConnection');
      showToast('Verbindungstest fehlgeschlagen', 'error');
    }
  };

  const toggleConnection = async (id: string, enabled: boolean) => {
    try {
      await axios.put(`/api/${context}/mcp/connections/${id}`, { enabled: !enabled });
      loadConnections();
    } catch (err) {
      logError(err, 'MCPHubTab.toggleConnection');
    }
  };

  // ===========================================
  // Internal Tools View
  // ===========================================

  const filteredTools = selectedCategory === 'all'
    ? MCP_TOOLS
    : MCP_TOOLS.filter(t => t.category === selectedCategory);

  const groupedTools = filteredTools.reduce<Record<string, MCPToolInfo[]>>((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {});

  // ===========================================
  // Render
  // ===========================================

  return (
    <div className="mcp-hub">
      <div className="mcp-hub-header">
        <h3>MCP Ecosystem</h3>
        <p className="mcp-hub-subtitle">
          {MCP_TOOLS.length} interne + {connections.filter(c => c.status === 'connected').length} externe Tools
        </p>
      </div>

      {/* Section Tabs */}
      <div className="mcp-section-tabs">
        <button
          type="button"
          className={`mcp-section-tab ${section === 'tools' ? 'active' : ''}`}
          onClick={() => setSection('tools')}
        >
          Interne Tools ({MCP_TOOLS.length})
        </button>
        <button
          type="button"
          className={`mcp-section-tab ${section === 'connections' ? 'active' : ''}`}
          onClick={() => setSection('connections')}
        >
          Externe Server ({connections.length})
        </button>
      </div>

      {/* Internal Tools Section */}
      {section === 'tools' && (
        <>
          <div className="mcp-hub-filters">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`mcp-filter-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span className="mcp-filter-icon">{cat.icon}</span>
                {cat.label}
                {cat.id !== 'all' && (
                  <span className="mcp-filter-count">
                    {MCP_TOOLS.filter(t => t.category === cat.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mcp-hub-tools">
            {Object.entries(groupedTools).map(([category, tools]) => (
              <div key={category} className="mcp-tool-group">
                <h4 className="mcp-group-label">{category}</h4>
                <div className="mcp-tool-grid">
                  {tools.map(tool => (
                    <div key={tool.name} className="mcp-tool-card">
                      <div className="mcp-tool-icon">{tool.icon}</div>
                      <div className="mcp-tool-info">
                        <span className="mcp-tool-name">{tool.name}</span>
                        <span className="mcp-tool-desc">{tool.description}</span>
                      </div>
                      <span className="mcp-tool-badge">MCP</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mcp-hub-info">
            <h4>MCP Verbindung</h4>
            <p>
              Diese Tools sind ueber das Model Context Protocol (MCP) verfuegbar
              und koennen von Claude Desktop, AI-Assistenten und anderen MCP-Clients genutzt werden.
            </p>
            <div className="mcp-config-snippet">
              <code>
                {`{
  "mcpServers": {
    "zenai": {
      "command": "node",
      "args": ["backend/dist/mcp/index.js"]
    }
  }
}`}
              </code>
            </div>
          </div>
        </>
      )}

      {/* External Connections Section */}
      {section === 'connections' && (
        <div className="mcp-connections">
          <div className="mcp-connections-header">
            <p className="mcp-connections-desc">
              Verbinde externe MCP-Server, um deren Tools im Chat und fuer Agenten verfuegbar zu machen.
            </p>
            <button
              type="button"
              className="neuro-btn neuro-btn-primary"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? 'Abbrechen' : '+ Server hinzufuegen'}
            </button>
          </div>

          {/* Add Connection Form */}
          {showAddForm && (
            <div className="mcp-add-form">
              <div className="mcp-form-field">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="z.B. Slack MCP Server"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="neuro-input"
                />
              </div>
              <div className="mcp-form-field">
                <label>URL</label>
                <input
                  type="url"
                  placeholder="https://mcp-server.example.com"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  className="neuro-input"
                />
              </div>
              <div className="mcp-form-field">
                <label>API Key (optional)</label>
                <input
                  type="password"
                  placeholder="Bearer Token"
                  value={newApiKey}
                  onChange={e => setNewApiKey(e.target.value)}
                  className="neuro-input"
                />
              </div>
              <button
                type="button"
                className="neuro-btn neuro-btn-primary"
                onClick={addConnection}
                disabled={!newName.trim() || !newUrl.trim()}
              >
                Verbinden
              </button>
            </div>
          )}

          {/* Connection List */}
          {loadingConnections ? (
            <div className="mcp-loading">Lade Verbindungen...</div>
          ) : connections.length === 0 ? (
            <div className="mcp-empty">
              <p>Keine externen MCP-Server verbunden.</p>
              <p className="mcp-empty-hint">
                Fuege einen MCP-Server hinzu, um dessen Tools im Chat nutzen zu koennen.
              </p>
            </div>
          ) : (
            <div className="mcp-connection-list">
              {connections.map(conn => (
                <div key={conn.id} className={`mcp-connection-card ${!conn.enabled ? 'disabled' : ''}`}>
                  <div className="mcp-connection-main">
                    <div className="mcp-connection-info">
                      <span className="mcp-connection-name">{conn.name}</span>
                      <span className="mcp-connection-url">{conn.url}</span>
                    </div>
                    <div className="mcp-connection-meta">
                      <StatusBadge status={conn.status} />
                      {conn.toolCount > 0 && (
                        <span className="mcp-connection-tools">{conn.toolCount} Tools</span>
                      )}
                      {conn.resourceCount > 0 && (
                        <span className="mcp-connection-resources">{conn.resourceCount} Resources</span>
                      )}
                    </div>
                  </div>
                  {conn.errorMessage && (
                    <div className="mcp-connection-error">{conn.errorMessage}</div>
                  )}
                  <div className="mcp-connection-actions">
                    <button
                      type="button"
                      className="neuro-btn neuro-btn-sm"
                      onClick={() => checkConnection(conn.id)}
                      title="Verbindung testen"
                    >
                      Testen
                    </button>
                    <button
                      type="button"
                      className="neuro-btn neuro-btn-sm"
                      onClick={() => toggleConnection(conn.id, conn.enabled)}
                    >
                      {conn.enabled ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button
                      type="button"
                      className="neuro-btn neuro-btn-sm neuro-btn-danger"
                      onClick={() => deleteConnection(conn.id)}
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HTTP API Info */}
          <div className="mcp-hub-info" style={{ marginTop: '1.5rem' }}>
            <h4>MCP HTTP API</h4>
            <p>
              Interne MCP-Tools sind auch ueber die HTTP API erreichbar:
            </p>
            <div className="mcp-config-snippet">
              <code>
                {`GET  /api/mcp/tools          - Alle Tools auflisten
POST /api/mcp/tools/call     - Tool ausfuehren
GET  /api/mcp/resources      - Resources auflisten
POST /api/mcp/resources/read - Resource lesen
GET  /api/mcp/status         - Server-Status`}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
