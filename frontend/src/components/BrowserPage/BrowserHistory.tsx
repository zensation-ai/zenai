/**
 * BrowserHistory - Browsing History list with search & domain filter
 */

import { useState, useCallback } from 'react';
import type { BrowsingHistoryEntry, DomainStats } from './types';

interface BrowserHistoryProps {
  entries: BrowsingHistoryEntry[];
  total: number;
  domainStats: DomainStats[];
  loading: boolean;
  onSearch: (query: string) => void;
  onFilterDomain: (domain: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onOpen: (url: string) => void;
}

export function BrowserHistory({
  entries, total, domainStats, loading,
  onSearch, onFilterDomain, onDelete, onClear, onOpen,
}: BrowserHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  }, [searchQuery, onSearch]);

  const handleDomainClick = useCallback((domain: string) => {
    if (activeDomain === domain) {
      setActiveDomain(null);
      onFilterDomain('');
    } else {
      setActiveDomain(domain);
      onFilterDomain(domain);
    }
  }, [activeDomain, onFilterDomain]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `Vor ${diffMins} Min.`;
    if (diffMins < 1440) return `Vor ${Math.floor(diffMins / 60)} Std.`;
    if (diffMins < 10080) return `Vor ${Math.floor(diffMins / 1440)} Tagen`;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="browser-history">
      {/* Search + Actions */}
      <div className="browser-history-toolbar">
        <form className="browser-history-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Verlauf durchsuchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="browser-history-search-input"
          />
          <button type="submit" className="browser-history-search-btn">Suchen</button>
        </form>
        <div className="browser-history-actions">
          {showClearConfirm ? (
            <>
              <span className="browser-history-confirm-text">Gesamten Verlauf loeschen?</span>
              <button
                type="button"
                className="browser-history-btn danger"
                onClick={() => { onClear(); setShowClearConfirm(false); }}
              >
                Ja
              </button>
              <button
                type="button"
                className="browser-history-btn"
                onClick={() => setShowClearConfirm(false)}
              >
                Nein
              </button>
            </>
          ) : (
            <button
              type="button"
              className="browser-history-btn"
              onClick={() => setShowClearConfirm(true)}
            >
              Verlauf loeschen
            </button>
          )}
        </div>
      </div>

      <div className="browser-history-layout">
        {/* Domain sidebar */}
        {domainStats.length > 0 && (
          <div className="browser-history-domains">
            <h3 className="browser-history-domains-title">Top-Domains</h3>
            {domainStats.slice(0, 15).map(stat => (
              <button
                key={stat.domain}
                type="button"
                className={`browser-history-domain ${activeDomain === stat.domain ? 'active' : ''}`}
                onClick={() => handleDomainClick(stat.domain)}
              >
                <span className="browser-history-domain-name">{stat.domain}</span>
                <span className="browser-history-domain-count">{stat.visit_count}</span>
              </button>
            ))}
          </div>
        )}

        {/* History list */}
        <div className="browser-history-list">
          {loading && (
            <div className="browser-history-loading">Wird geladen...</div>
          )}

          {!loading && entries.length === 0 && (
            <div className="browser-history-empty">
              <span className="browser-history-empty-icon">🕐</span>
              <p>Kein Verlauf vorhanden</p>
            </div>
          )}

          {entries.map(entry => (
            <div key={entry.id} className="browser-history-item">
              <div
                className="browser-history-item-main"
                onClick={() => onOpen(entry.url)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(entry.url)}
              >
                <div className="browser-history-item-title">
                  {entry.title || entry.domain}
                </div>
                <div className="browser-history-item-url">{entry.url}</div>
                {entry.content_summary && (
                  <div className="browser-history-item-summary">{entry.content_summary}</div>
                )}
                <div className="browser-history-item-meta">
                  <span className="browser-history-item-domain">{entry.domain}</span>
                  <span className="browser-history-item-time">{formatTime(entry.visit_time)}</span>
                  {entry.category && (
                    <span className="browser-history-item-category">{entry.category}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="browser-history-item-delete"
                onClick={() => onDelete(entry.id)}
                aria-label="Eintrag loeschen"
                title="Loeschen"
              >
                x
              </button>
            </div>
          ))}

          {total > entries.length && (
            <div className="browser-history-more">
              {total - entries.length} weitere Eintraege
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
