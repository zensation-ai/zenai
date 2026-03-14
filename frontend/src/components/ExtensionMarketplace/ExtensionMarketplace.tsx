/**
 * Phase 75: Extension Marketplace
 *
 * Browse, install, and manage extensions.
 * Features category filter, search, install with permission dialog,
 * and an installed section with enable/disable toggles.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ExtensionCard, type ExtensionData } from './ExtensionCard';
import './ExtensionMarketplace.css';

// ===========================================
// Types
// ===========================================

type ViewMode = 'browse' | 'installed';

const CATEGORY_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'tool', label: 'Tools' },
  { value: 'widget', label: 'Widgets' },
  { value: 'theme', label: 'Themes' },
  { value: 'integration', label: 'Integrationen' },
  { value: 'agent', label: 'Agenten' },
];

// ===========================================
// Component
// ===========================================

export function ExtensionMarketplace() {
  const { getAccessToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || '';

  const [extensions, setExtensions] = useState<ExtensionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken();
    const apiKey = import.meta.env.VITE_API_KEY;
    return {
      'Content-Type': 'application/json',
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : apiKey
          ? { 'x-api-key': apiKey }
          : {}),
    };
  }, [getAccessToken]);

  // ===========================================
  // Data Fetching
  // ===========================================

  const fetchExtensions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (searchQuery) params.set('search', searchQuery);

      const endpoint = viewMode === 'installed'
        ? `${apiUrl}/api/extensions/installed`
        : `${apiUrl}/api/extensions?${params.toString()}`;

      const res = await fetch(endpoint, { headers: authHeaders() });
      if (!res.ok) throw new Error('Fehler beim Laden der Erweiterungen');

      const data = await res.json();
      setExtensions(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, authHeaders, viewMode, typeFilter, searchQuery]);

  useEffect(() => {
    fetchExtensions();
  }, [fetchExtensions]);

  // ===========================================
  // Actions
  // ===========================================

  const handleInstall = async (extensionId: string, permissions: string[]) => {
    const res = await fetch(`${apiUrl}/api/extensions/${extensionId}/install`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ permissions }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Installation fehlgeschlagen');
    }

    await fetchExtensions();
  };

  const handleUninstall = async (extensionId: string) => {
    const res = await fetch(`${apiUrl}/api/extensions/${extensionId}/uninstall`, {
      method: 'POST',
      headers: authHeaders(),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Deinstallation fehlgeschlagen');
    }

    await fetchExtensions();
  };

  const handleEnable = async (extensionId: string) => {
    const res = await fetch(`${apiUrl}/api/extensions/${extensionId}/enable`, {
      method: 'POST',
      headers: authHeaders(),
    });

    if (!res.ok) throw new Error('Aktivierung fehlgeschlagen');
    await fetchExtensions();
  };

  const handleDisable = async (extensionId: string) => {
    const res = await fetch(`${apiUrl}/api/extensions/${extensionId}/disable`, {
      method: 'POST',
      headers: authHeaders(),
    });

    if (!res.ok) throw new Error('Deaktivierung fehlgeschlagen');
    await fetchExtensions();
  };

  // ===========================================
  // Filtered Data
  // ===========================================

  const filteredExtensions = viewMode === 'installed'
    ? extensions
    : extensions.filter(ext => {
        if (typeFilter !== 'all' && ext.type !== typeFilter) return false;
        return true;
      });

  // ===========================================
  // Render
  // ===========================================

  return (
    <div className="extension-marketplace">
      {/* Header Controls */}
      <div className="extension-marketplace-controls">
        <div className="extension-marketplace-tabs">
          <button
            type="button"
            className={`extension-tab ${viewMode === 'browse' ? 'active' : ''}`}
            onClick={() => setViewMode('browse')}
          >
            Erkunden
          </button>
          <button
            type="button"
            className={`extension-tab ${viewMode === 'installed' ? 'active' : ''}`}
            onClick={() => setViewMode('installed')}
          >
            Installiert
            {extensions.filter(e => e.installed).length > 0 && viewMode === 'browse' && (
              <span className="extension-tab-count">
                {extensions.filter(e => e.installed).length}
              </span>
            )}
          </button>
        </div>

        {viewMode === 'browse' && (
          <div className="extension-marketplace-filters">
            <input
              type="text"
              className="extension-search"
              placeholder="Erweiterungen suchen..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Erweiterungen suchen"
            />
            <div className="extension-category-filters">
              {CATEGORY_FILTERS.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  className={`extension-filter-chip ${typeFilter === cat.value ? 'active' : ''}`}
                  onClick={() => setTypeFilter(cat.value)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {error && (
        <div className="extension-marketplace-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="extension-marketplace-loading">
          <div className="extension-loading-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="extension-card-skeleton" />
            ))}
          </div>
        </div>
      ) : filteredExtensions.length === 0 ? (
        <div className="extension-marketplace-empty">
          <span className="extension-empty-icon">
            {viewMode === 'installed' ? '\uD83D\uDCE6' : '\uD83D\uDD0D'}
          </span>
          <p>
            {viewMode === 'installed'
              ? 'Keine Erweiterungen installiert'
              : 'Keine Erweiterungen gefunden'}
          </p>
          {viewMode === 'installed' && (
            <button
              type="button"
              className="extension-card-btn install"
              onClick={() => setViewMode('browse')}
            >
              Erweiterungen erkunden
            </button>
          )}
        </div>
      ) : (
        <div className="extension-marketplace-grid">
          {filteredExtensions.map(ext => (
            <ExtensionCard
              key={ext.id}
              extension={ext}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onEnable={handleEnable}
              onDisable={handleDisable}
            />
          ))}
        </div>
      )}
    </div>
  );
}
