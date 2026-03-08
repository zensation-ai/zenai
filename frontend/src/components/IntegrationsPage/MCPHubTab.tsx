/**
 * Phase 7: MCP Hub Tab
 * Shows all available MCP tools grouped by domain
 */

import { useState } from 'react';

interface MCPToolInfo {
  name: string;
  description: string;
  category: string;
  icon: string;
}

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

  // Contacts (Phase 7)
  { name: 'search_contacts', description: 'Kontakte nach Name/Email suchen', category: 'Kontakte', icon: '👤' },
  { name: 'get_contact_timeline', description: 'Interaktions-Timeline eines Kontakts', category: 'Kontakte', icon: '📅' },
  { name: 'contact_follow_ups', description: 'Follow-up-Empfehlungen', category: 'Kontakte', icon: '📞' },
  { name: 'contact_stats', description: 'Kontakt-Statistiken', category: 'Kontakte', icon: '📊' },

  // Finance (Phase 7)
  { name: 'financial_overview', description: 'Einnahmen, Ausgaben & Trends', category: 'Finanzen', icon: '💰' },
  { name: 'get_transactions', description: 'Transaktionen filtern & auflisten', category: 'Finanzen', icon: '💳' },
  { name: 'budget_status', description: 'Budget-Fortschritt & Limits', category: 'Finanzen', icon: '📊' },
  { name: 'expense_categories', description: 'Ausgaben nach Kategorien', category: 'Finanzen', icon: '🏷️' },

  // Screen Memory (Phase 7)
  { name: 'search_screen_memory', description: 'OCR-Text & Apps durchsuchen', category: 'Screen Memory', icon: '🖥️' },
  { name: 'screen_memory_stats', description: 'Aufzeichnungs-Statistiken', category: 'Screen Memory', icon: '📊' },

  // Proactive Intelligence (Phase 7)
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

export function MCPHubTab() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredTools = selectedCategory === 'all'
    ? MCP_TOOLS
    : MCP_TOOLS.filter(t => t.category === selectedCategory);

  const groupedTools = filteredTools.reduce<Record<string, MCPToolInfo[]>>((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {});

  return (
    <div className="mcp-hub">
      <div className="mcp-hub-header">
        <h3>MCP Tool Hub</h3>
        <p className="mcp-hub-subtitle">
          {MCP_TOOLS.length} Tools verfuegbar via Model Context Protocol
        </p>
      </div>

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
    </div>
  );
}
