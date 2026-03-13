/**
 * TopBar - Schlanke obere Leiste
 *
 * Ersetzt den schweren Header. Enthält:
 * - Mobile Sidebar Toggle (< 768px)
 * - Seitentitel
 * - Suchfeld (öffnet CommandPalette)
 * - Context Switcher, Theme Toggle, Status
 */

import { memo } from 'react';
import type { Page, ApiStatus } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { ContextSwitcher } from '../ContextSwitcher';
import { ThemeToggle } from '../ThemeToggle';
import { getPageLabel, getPageDescription } from '../../navigation';
import './TopBar.css';

interface TopBarProps {
  currentPage: Page;
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  apiStatus: ApiStatus | null;
  onOpenSearch: () => void;
  onOpenMobileSidebar: () => void;
  onRefresh: () => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

export const TopBar = memo(function TopBar({
  currentPage,
  context,
  onContextChange,
  apiStatus,
  onOpenSearch,
  onOpenMobileSidebar,
  onRefresh,
  isFavorited,
  onToggleFavorite,
}: TopBarProps) {
  const pageLabel = getPageLabel(currentPage);
  const pageDescription = getPageDescription(currentPage);

  return (
    <header className="topbar" role="banner">
      <div className="topbar-content">
        {/* Left: Mobile menu + Page title + Favorite */}
        <div className="topbar-left">
          <button
            type="button"
            className="topbar-mobile-toggle neuro-focus-ring"
            onClick={onOpenMobileSidebar}
            aria-label="Navigation öffnen"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="topbar-title" role="heading" aria-level={1}>{pageLabel}</span>
          {pageDescription && (
            <span className="topbar-subtitle">{pageDescription}</span>
          )}
          {onToggleFavorite && currentPage !== 'home' && (
            <button
              type="button"
              className={`topbar-favorite neuro-focus-ring ${isFavorited ? 'active' : ''}`}
              onClick={onToggleFavorite}
              title={isFavorited ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              aria-label={isFavorited ? 'Seite aus Favoriten entfernen' : 'Seite zu Favoriten hinzufügen'}
              aria-pressed={isFavorited}
            >
              <span aria-hidden="true">{isFavorited ? '★' : '☆'}</span>
            </button>
          )}
        </div>

        {/* Center: Search trigger */}
        <button
          type="button"
          className="topbar-search neuro-focus-ring"
          onClick={onOpenSearch}
          aria-label="Schnellnavigation öffnen"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="topbar-search-icon" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="topbar-search-placeholder">Suchen...</span>
          <kbd className="topbar-search-shortcut">⌘K</kbd>
        </button>

        {/* Right: Context (hidden on chat page - context tiles are integrated there), Theme, Status, Refresh */}
        <div className="topbar-right">
          {currentPage !== 'chat' && (
            <ContextSwitcher
              context={context}
              onContextChange={onContextChange}
            />
          )}
          <ThemeToggle className="compact" />
          <div className="topbar-status" aria-label="Systemstatus">
            <span
              className={`topbar-status-dot ${apiStatus?.database ? 'connected' : 'disconnected'}`}
              title={apiStatus?.database ? 'Datenbank verbunden' : 'Datenbank getrennt'}
              role="status"
              aria-label={apiStatus?.database ? 'Datenbank verbunden' : 'Datenbank getrennt'}
            />
            <span
              className={`topbar-status-dot ${apiStatus?.ollama ? 'connected' : 'disconnected'}`}
              title={apiStatus?.ollama ? 'KI verbunden' : 'KI getrennt'}
              role="status"
              aria-label={apiStatus?.ollama ? 'KI verbunden' : 'KI getrennt'}
            />
          </div>
          <button
            type="button"
            className="topbar-refresh neuro-focus-ring"
            onClick={onRefresh}
            title="Neu laden"
            aria-label="Daten neu laden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 8a6 6 0 0111.5-2.5M14 8a6 6 0 01-11.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 2v3.5h-3.5M2 14v-3.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
});

export default TopBar;
