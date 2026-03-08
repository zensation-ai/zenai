/**
 * Screen Memory Page - Phase 5
 *
 * Timeline + Search + Settings for screen activity tracking.
 * Note: Actual capture only works in Electron. Web version shows
 * stored data and search capabilities.
 *
 * Uses HubPage for unified layout.
 */

import { useState, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { HubPage, type TabDef } from '../HubPage';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { useScreenMemoryData } from './useScreenMemoryData';
import type { ScreenCapture, ScreenMemoryFilters, ScreenMemoryStats } from './types';
import './ScreenMemoryPage.css';

type ScreenMemoryTab = 'timeline' | 'search' | 'settings';

const TABS: readonly TabDef<ScreenMemoryTab>[] = [
  { id: 'timeline', label: 'Timeline', icon: '📅' },
  { id: 'search', label: 'Suche', icon: '🔍' },
  { id: 'settings', label: 'Einstellungen', icon: '⚙️' },
];

const VALID_TABS = TABS.map(t => t.id);

interface ScreenMemoryPageProps {
  context: AIContext;
  initialTab?: ScreenMemoryTab;
  onBack: () => void;
}

export function ScreenMemoryPage({ context, initialTab = 'timeline', onBack }: ScreenMemoryPageProps) {
  const { activeTab, handleTabChange } = useTabNavigation<ScreenMemoryTab>({
    initialTab,
    validTabs: VALID_TABS,
    defaultTab: 'timeline',
    basePath: '/screen-memory',
  });

  const {
    captures,
    stats,
    loading,
    totalCaptures,
    fetchCaptures,
    deleteCapture,
    cleanup,
  } = useScreenMemoryData({ context });

  const subtitle = stats
    ? `${stats.total_captures} Aufnahmen · ${stats.total_apps} Apps · ${stats.captures_today} heute`
    : undefined;

  return (
    <HubPage
      title="Screen Memory"
      icon="🧠"
      subtitle={subtitle}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      ariaLabel="Screen Memory Navigation"
    >
      {activeTab === 'timeline' && (
        <TimelineTab
          captures={captures}
          total={totalCaptures}
          loading={loading}
          onDelete={deleteCapture}
          onLoadMore={() => fetchCaptures({ limit: 50, offset: captures.length })}
        />
      )}
      {activeTab === 'search' && (
        <SearchTab
          context={context}
          onSearch={(filters) => fetchCaptures(filters)}
          captures={captures}
          loading={loading}
          stats={stats}
        />
      )}
      {activeTab === 'settings' && (
        <SettingsTab
          stats={stats}
          onCleanup={cleanup}
        />
      )}
    </HubPage>
  );
}

// ============================================
// Timeline Tab
// ============================================

function TimelineTab({
  captures,
  total,
  loading,
  onDelete,
  onLoadMore,
}: {
  captures: ScreenCapture[];
  total: number;
  loading: boolean;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (loading && captures.length === 0) {
    return <div className="screen-memory-loading">Lade Timeline...</div>;
  }

  if (captures.length === 0) {
    return (
      <div className="screen-memory-empty">
        <span className="screen-memory-empty-icon">🧠</span>
        <p>Keine Aufnahmen vorhanden</p>
        <p className="screen-memory-empty-sub">
          Screen Memory zeichnet Bildschirmaktivitaet auf (nur in der Desktop-App).
        </p>
      </div>
    );
  }

  // Group captures by date
  const grouped = new Map<string, typeof captures>();
  for (const capture of captures) {
    const date = new Date(capture.timestamp).toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(capture);
  }

  return (
    <div className="timeline-container">
      <div className="timeline-count">{total} Aufnahmen</div>

      {Array.from(grouped.entries()).map(([date, items]) => (
        <div key={date} className="timeline-group">
          <h3 className="timeline-date">{date}</h3>
          <div className="timeline-items">
            {items.map(capture => (
              <div key={capture.id} className="timeline-item">
                <div className="timeline-time">
                  {new Date(capture.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="timeline-dot" />
                <div className="timeline-card">
                  <div className="timeline-card-header">
                    <span className="timeline-app">
                      {capture.app_name || 'Unbekannt'}
                    </span>
                    {capture.duration_seconds && (
                      <span className="timeline-duration">
                        {Math.round(capture.duration_seconds / 60)} min
                      </span>
                    )}
                  </div>
                  {capture.window_title && (
                    <div className="timeline-title">{capture.window_title}</div>
                  )}
                  {capture.url && (
                    <div className="timeline-url">{capture.url}</div>
                  )}
                  {capture.ocr_text && (
                    <div className="timeline-ocr">
                      {capture.ocr_text.slice(0, 200)}
                      {capture.ocr_text.length > 200 ? '...' : ''}
                    </div>
                  )}
                  <div className="timeline-card-actions">
                    {deleteConfirm === capture.id ? (
                      <div className="timeline-confirm">
                        <span>Loeschen?</span>
                        <button type="button" className="btn-sm danger" onClick={() => { onDelete(capture.id); setDeleteConfirm(null); }}>Ja</button>
                        <button type="button" className="btn-sm" onClick={() => setDeleteConfirm(null)}>Nein</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => setDeleteConfirm(capture.id)}
                      >
                        Loeschen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {captures.length < total && (
        <button
          type="button"
          className="screen-memory-load-more"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Lade...' : 'Mehr laden'}
        </button>
      )}
    </div>
  );
}

// ============================================
// Search Tab
// ============================================

function SearchTab({
  context: _context,
  onSearch,
  captures,
  loading,
  stats,
}: {
  context: string;
  onSearch: (filters: ScreenMemoryFilters) => void;
  captures: ScreenCapture[];
  loading: boolean;
  stats: ScreenMemoryStats | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const handleSearch = useCallback(() => {
    onSearch({
      search: searchQuery || undefined,
      app_name: appFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      limit: 50,
    });
  }, [searchQuery, appFilter, dateFrom, dateTo, onSearch]);

  return (
    <div className="search-container">
      <div className="search-form">
        <input
          type="text"
          placeholder="Text suchen (OCR, Fenstertitel, URL)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="search-input"
        />
        <div className="search-filters">
          <select
            value={appFilter}
            onChange={e => setAppFilter(e.target.value)}
            className="search-select"
          >
            <option value="">Alle Apps</option>
            {stats?.top_apps?.map(app => (
              <option key={app.app_name} value={app.app_name}>
                {app.app_name} ({app.count})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="search-date"
            placeholder="Von"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="search-date"
            placeholder="Bis"
          />
          <button type="button" className="btn-primary" onClick={handleSearch}>
            Suchen
          </button>
        </div>
      </div>

      {loading ? (
        <div className="screen-memory-loading">Suche...</div>
      ) : captures.length === 0 ? (
        <div className="screen-memory-empty">
          <span className="screen-memory-empty-icon">🔍</span>
          <p>Keine Ergebnisse</p>
          <p className="screen-memory-empty-sub">
            Versuche andere Suchbegriffe oder Filter.
          </p>
        </div>
      ) : (
        <div className="search-results">
          <div className="search-results-count">{captures.length} Ergebnisse</div>
          {captures.map(capture => (
            <div key={capture.id} className="search-result-item">
              <div className="search-result-header">
                <span className="search-result-app">{capture.app_name || 'Unbekannt'}</span>
                <span className="search-result-time">
                  {new Date(capture.timestamp).toLocaleString('de-DE')}
                </span>
              </div>
              {capture.window_title && (
                <div className="search-result-title">{capture.window_title}</div>
              )}
              {capture.url && (
                <div className="search-result-url">{capture.url}</div>
              )}
              {capture.ocr_text && (
                <div className="search-result-text">
                  {capture.ocr_text.slice(0, 300)}
                  {capture.ocr_text.length > 300 ? '...' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Settings Tab
// ============================================

function SettingsTab({
  stats,
  onCleanup,
}: {
  stats: ScreenMemoryStats | null;
  onCleanup: (days: number) => Promise<number>;
}) {
  const [retentionDays, setRetentionDays] = useState(30);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const handleCleanup = async () => {
    setCleaning(true);
    const deleted = await onCleanup(retentionDays);
    setCleanupResult(`${deleted} alte Aufnahmen geloescht.`);
    setCleaning(false);
  };

  const isElectron = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).electronAPI;

  return (
    <div className="settings-container">
      {/* Capture Status */}
      <div className="settings-section">
        <h3>Aufnahme-Status</h3>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Plattform</span>
            <span className="settings-value">
              {isElectron ? 'Desktop (Electron)' : 'Web (Aufnahme nicht verfuegbar)'}
            </span>
          </div>
          {!isElectron && (
            <div className="settings-notice">
              Screen Memory erfordert die Desktop-App fuer Bildschirmaufnahmen.
              Die Suche ueber bereits gespeicherte Aufnahmen ist auch im Web verfuegbar.
            </div>
          )}
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="settings-section">
          <h3>Statistiken</h3>
          <div className="settings-card">
            <div className="settings-row">
              <span className="settings-label">Gesamte Aufnahmen</span>
              <span className="settings-value">{stats.total_captures}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Erfasste Apps</span>
              <span className="settings-value">{stats.total_apps}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Aufnahmedauer</span>
              <span className="settings-value">{stats.total_duration_hours.toFixed(1)} Stunden</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Heute</span>
              <span className="settings-value">{stats.captures_today} Aufnahmen</span>
            </div>
          </div>

          {stats.top_apps.length > 0 && (
            <div className="settings-card">
              <h4>Top Apps</h4>
              <div className="top-apps-list">
                {stats.top_apps.map(app => (
                  <div key={app.app_name} className="top-app-row">
                    <span className="top-app-name">{app.app_name}</span>
                    <span className="top-app-count">{app.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cleanup */}
      <div className="settings-section">
        <h3>Daten bereinigen</h3>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Aufbewahrung</span>
            <select
              value={retentionDays}
              onChange={e => setRetentionDays(Number(e.target.value))}
              className="settings-select"
            >
              <option value={7}>7 Tage</option>
              <option value={14}>14 Tage</option>
              <option value={30}>30 Tage</option>
              <option value={60}>60 Tage</option>
              <option value={90}>90 Tage</option>
            </select>
          </div>
          <button
            type="button"
            className="btn-danger"
            onClick={handleCleanup}
            disabled={cleaning}
          >
            {cleaning ? 'Bereinige...' : `Aufnahmen aelter als ${retentionDays} Tage loeschen`}
          </button>
          {cleanupResult && (
            <div className="settings-result">{cleanupResult}</div>
          )}
        </div>
      </div>

      {/* Privacy */}
      <div className="settings-section">
        <h3>Datenschutz</h3>
        <div className="settings-card">
          <div className="settings-notice privacy">
            Alle Screenshots und OCR-Daten werden lokal verarbeitet und gespeichert.
            Keine Bilddaten werden an Cloud-Dienste gesendet. Nur Textabfragen
            fuer die KI-Zusammenfassung werden bei Bedarf uebermittelt.
          </div>
          <ul className="privacy-list">
            <li>Banking- und Passwort-Apps werden automatisch ausgeschlossen</li>
            <li>Aufnahmen koennen jederzeit geloescht werden</li>
            <li>Aufbewahrungsdauer ist konfigurierbar</li>
            <li>Capture kann jederzeit pausiert werden</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
