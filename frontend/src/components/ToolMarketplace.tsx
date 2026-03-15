/**
 * ToolMarketplace - MCP Server Discovery & Marketplace (Phase 71)
 *
 * Grid view of available and installed MCP servers.
 * Allows browsing, filtering, and installing community MCP servers.
 */

import { useState, useEffect, useCallback } from 'react';
import type { AIContext } from './ContextSwitcher';
import './ToolMarketplace.css';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

// ===========================================
// Types
// ===========================================

interface MCPCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  category: string;
  npmPackage: string | null;
  repoUrl: string;
  requiredCredentials: MCPCredentialField[];
  popularity: number;
  estimatedTools: number;
  icon: string;
  premium: boolean;
}

interface MCPCredentialField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  type: 'text' | 'password' | 'url';
}

interface InstalledServer {
  id: string;
  name: string;
  connected?: boolean;
  liveHealthy?: boolean;
}

type Category = 'all' | 'communication' | 'productivity' | 'development' | 'design' | 'crm' | 'storage';

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
// Category labels
// ===========================================

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'Alle',
  communication: 'Kommunikation',
  productivity: 'Produktivität',
  development: 'Entwicklung',
  design: 'Design',
  crm: 'CRM',
  storage: 'Speicher',
};

// ===========================================
// Component
// ===========================================

interface ToolMarketplaceProps {
  context: AIContext;
  installedServers: InstalledServer[];
  onInstall: (serverName: string) => void;
}

export function ToolMarketplace({ context, installedServers, onInstall }: ToolMarketplaceProps) {
  const [servers, setServers] = useState<MCPCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [categories, setCategories] = useState<string[]>([]);

  // Load catalog
  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCategory !== 'all') params.set('category', selectedCategory);

      const queryStr = params.toString();
      const url = `/api/${context}/mcp/discover${queryStr ? `?${queryStr}` : ''}`;
      const result = await apiFetch<{
        servers: MCPCatalogEntry[];
        total: number;
        categories: string[];
      }>(url);

      setServers(result.servers);
      if (result.categories.length > 0) {
        setCategories(result.categories);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Marketplace konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [context, searchQuery, selectedCategory]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Check if a server is already installed
  const isInstalled = (serverName: string): boolean => {
    return installedServers.some(s =>
      s.name.toLowerCase().includes(serverName.toLowerCase()) ||
      serverName.toLowerCase().includes(s.name.toLowerCase())
    );
  };

  const isConnected = (serverName: string): boolean => {
    return installedServers.some(s =>
      (s.name.toLowerCase().includes(serverName.toLowerCase()) ||
       serverName.toLowerCase().includes(s.name.toLowerCase())) &&
      (s.connected || s.liveHealthy)
    );
  };

  const getStatusBadge = (server: MCPCatalogEntry) => {
    if (isConnected(server.name)) {
      return <span className="tm-status tm-status--connected">Verbunden</span>;
    }
    if (isInstalled(server.name)) {
      return <span className="tm-status tm-status--installed">Installiert</span>;
    }
    if (server.premium) {
      return <span className="tm-status tm-status--premium">Premium</span>;
    }
    return <span className="tm-status tm-status--available">Verfügbar</span>;
  };

  // ===========================================
  // Render
  // ===========================================

  return (
    <div className="tool-marketplace">
      {/* Search & Filters */}
      <div className="tm-filters">
        <div className="tm-search">
          <input
            type="text"
            placeholder="MCP Server suchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="tm-search-input"
          />
        </div>
        <div className="tm-categories">
          <button
            className={`tm-category-btn ${selectedCategory === 'all' ? 'tm-category-btn--active' : ''}`}
            onClick={() => setSelectedCategory('all')}
            aria-pressed={selectedCategory === 'all'}
          >
            {CATEGORY_LABELS.all}
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`tm-category-btn ${selectedCategory === cat ? 'tm-category-btn--active' : ''}`}
              onClick={() => setSelectedCategory(cat as Category)}
              aria-pressed={selectedCategory === cat}
            >
              {CATEGORY_LABELS[cat as Category] || cat}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="tm-error" role="alert">
          <span>{error}</span>
          <button className="tm-error-dismiss" onClick={() => setError(null)} aria-label="Fehler schließen">
            x
          </button>
        </div>
      )}

      {/* Server Grid */}
      {loading ? (
        <div className="tm-loading">Lade Marketplace...</div>
      ) : servers.length === 0 ? (
        <div className="tm-empty">
          <h4>Keine Server gefunden</h4>
          <p>Versuche eine andere Suche oder Kategorie.</p>
        </div>
      ) : (
        <div className="tm-grid">
          {servers.map(server => (
            <div key={server.name} className="tm-card">
              <div className="tm-card-header">
                <div className="tm-card-icon" data-icon={server.icon}>
                  {server.displayName.charAt(0)}
                </div>
                <div className="tm-card-title">
                  <h4>{server.displayName}</h4>
                  <span className="tm-card-category">
                    {CATEGORY_LABELS[server.category as Category] || server.category}
                  </span>
                </div>
                {getStatusBadge(server)}
              </div>

              <p className="tm-card-desc">{server.description}</p>

              <div className="tm-card-meta">
                <span className="tm-meta-item" title="Geschaetzte Tools">
                  ~{server.estimatedTools} Tools
                </span>
                <span className="tm-meta-item" title="Beliebtheit">
                  Beliebtheit: {server.popularity}%
                </span>
              </div>

              <div className="tm-card-footer">
                {server.repoUrl && (
                  <a
                    href={server.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tm-link"
                  >
                    Repository
                  </a>
                )}
                {isInstalled(server.name) ? (
                  <button className="tm-btn tm-btn--installed" disabled>
                    Installiert
                  </button>
                ) : (
                  <button
                    className="tm-btn tm-btn--install"
                    onClick={() => onInstall(server.name)}
                  >
                    Installieren
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ToolMarketplace;
