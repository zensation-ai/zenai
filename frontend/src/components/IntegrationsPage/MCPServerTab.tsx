/**
 * MCP Server Tab (Phase 55)
 *
 * Displays ZenAI's MCP Server configuration:
 * - Connection URL and auth info
 * - List of exposed tools with descriptions
 * - Connection instructions for external clients
 */

import { useState, useEffect } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export function MCPServerTab() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
  const mcpEndpoint = `${apiUrl}/api/mcp-server`;
  const discoveryUrl = `${apiUrl}/api/mcp-server/.well-known/mcp.json`;

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    try {
      const res = await axios.get('/api/mcp-server/tools');
      setTools(res.data.data?.tools || []);
    } catch (err) {
      logError('MCPServerTab.loadTools', err as Error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const configSnippet = JSON.stringify({
    mcpServers: {
      zenai: {
        url: mcpEndpoint,
        transport: 'http',
        headers: { Authorization: 'Bearer YOUR_API_KEY' },
      },
    },
  }, null, 2);

  if (loading) {
    return (
      <div className="neuro-loading-contextual">
        <div className="neuro-loading-spinner" />
        <p className="neuro-loading-message">Lade MCP Server Info...</p>
      </div>
    );
  }

  return (
    <div className="mcp-server-tab">
      <div className="section-header">
        <h3>MCP Server</h3>
        <span className="status-badge active">Aktiv</span>
      </div>

      <p className="section-description">
        ZenAI ist als MCP Server erreichbar. Externe AI-Clients (Claude Desktop, Cursor, etc.)
        k&ouml;nnen sich verbinden und ZenAI-Tools nutzen.
      </p>

      <div className="info-card">
        <h4>Verbindungsdaten</h4>
        <div className="info-row">
          <label>JSON-RPC Endpoint:</label>
          <div className="copyable">
            <code>{mcpEndpoint}</code>
            <button
              type="button"
              className="copy-btn"
              onClick={() => copyToClipboard(mcpEndpoint, 'endpoint')}
            >
              {copied === 'endpoint' ? 'Kopiert!' : 'Kopieren'}
            </button>
          </div>
        </div>
        <div className="info-row">
          <label>Discovery URL:</label>
          <div className="copyable">
            <code>{discoveryUrl}</code>
            <button
              type="button"
              className="copy-btn"
              onClick={() => copyToClipboard(discoveryUrl, 'discovery')}
            >
              {copied === 'discovery' ? 'Kopiert!' : 'Kopieren'}
            </button>
          </div>
        </div>
        <div className="info-row">
          <label>Auth:</label>
          <code>Bearer &lt;API Key&gt;</code>
        </div>
        <div className="info-row">
          <label>Protokoll:</label>
          <code>JSON-RPC 2.0 / MCP 2024-11-05</code>
        </div>
      </div>

      <div className="info-card">
        <h4>Konfiguration f&uuml;r Claude Desktop / Cursor</h4>
        <pre className="config-snippet">{configSnippet}</pre>
        <button
          type="button"
          className="copy-btn"
          onClick={() => copyToClipboard(configSnippet, 'config')}
        >
          {copied === 'config' ? 'Kopiert!' : 'Konfiguration kopieren'}
        </button>
      </div>

      <div className="info-card">
        <h4>Verf&uuml;gbare Tools ({tools.length})</h4>
        <div className="tools-grid">
          {tools.map((tool) => (
            <div key={tool.name} className="tool-card">
              <div className="tool-name">{tool.name}</div>
              <div className="tool-description">{tool.description}</div>
              <div className="tool-params">
                {Object.entries(tool.inputSchema.properties).map(([param]) => (
                  <span key={param} className={`param-tag ${tool.inputSchema.required?.includes(param) ? 'required' : ''}`}>
                    {param}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
