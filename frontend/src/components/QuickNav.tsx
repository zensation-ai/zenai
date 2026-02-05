/**
 * QuickNav - Kompakte Schnellzugriff-Leiste
 *
 * Neuro-optimierte Navigation mit:
 * - Keyboard Arrow Navigation
 * - Focus Management
 * - Memoized Active State
 * - WCAG 2.1 AA Compliant
 */
import { memo, useCallback, useMemo, useRef } from 'react';
import type { Page } from '../types';
import './QuickNav.css';

interface QuickNavTile {
  page: Page;
  icon: string;
  label: string;
  shortLabel?: string;
  color: string;
  /** Sub-pages that should highlight this tile */
  subPages?: Page[];
}

const QUICK_NAV_TILES: QuickNavTile[] = [
  {
    page: 'ideas',
    icon: '💭',
    label: 'Gedanken',
    color: 'primary'
  },
  {
    page: 'insights',
    icon: '📊',
    label: 'Insights',
    color: 'blue',
    subPages: ['dashboard', 'analytics', 'digest', 'knowledge-graph'] as Page[]
  },
  {
    page: 'ai-workshop',
    icon: '🧠',
    label: 'KI-Werkstatt',
    shortLabel: 'KI',
    color: 'purple',
    subPages: ['incubator', 'proactive', 'evolution'] as Page[]
  },
  {
    page: 'archive',
    icon: '📥',
    label: 'Archiv',
    color: 'gray'
  },
  {
    page: 'learning',
    icon: '📚',
    label: 'Lernen',
    color: 'green',
    subPages: ['learning-tasks'] as Page[]
  },
  {
    page: 'meetings',
    icon: '📅',
    label: 'Meetings',
    color: 'cyan'
  },
  {
    page: 'settings',
    icon: '⚙️',
    label: 'Einstellungen',
    shortLabel: 'Mehr',
    color: 'slate',
    subPages: ['profile', 'automations', 'integrations', 'notifications', 'export', 'sync', 'triage', 'media', 'stories', 'personalization'] as Page[]
  },
];

interface QuickNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  archivedCount?: number;
}

export const QuickNav = memo(function QuickNav({
  currentPage,
  onNavigate,
  archivedCount = 0
}: QuickNavProps) {
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Memoized active state calculation
  const getIsActive = useCallback((tile: QuickNavTile): boolean => {
    if (currentPage === tile.page) return true;
    return tile.subPages?.includes(currentPage) ?? false;
  }, [currentPage]);

  // Find currently active tile index
  const activeIndex = useMemo(() => {
    return QUICK_NAV_TILES.findIndex(tile => getIsActive(tile));
  }, [getIsActive]);

  // Focus a tile by index
  const focusTile = useCallback((index: number) => {
    const normalizedIndex = ((index % QUICK_NAV_TILES.length) + QUICK_NAV_TILES.length) % QUICK_NAV_TILES.length;
    tileRefs.current[normalizedIndex]?.focus();
  }, []);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusTile(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusTile(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTile(0);
        break;
      case 'End':
        e.preventDefault();
        focusTile(QUICK_NAV_TILES.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onNavigate(QUICK_NAV_TILES[index].page);
        break;
    }
  }, [focusTile, onNavigate]);

  return (
    <nav className="quick-nav" aria-label="Schnellzugriff">
      <div className="quick-nav-content">
        {QUICK_NAV_TILES.map((tile, index) => {
          const isActive = getIsActive(tile);
          const isFirst = index === 0;
          const shouldFocus = isActive || (activeIndex === -1 && isFirst);

          return (
            <button
              key={tile.page}
              ref={(el) => { tileRefs.current[index] = el; }}
              type="button"
              className={`quick-nav-tile neuro-focus-ring ${isActive ? 'active' : ''} color-${tile.color}`}
              onClick={() => onNavigate(tile.page)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`${tile.label}${tile.page === 'archive' && archivedCount > 0 ? ` (${archivedCount} archiviert)` : ''}`}
              tabIndex={shouldFocus ? 0 : -1}
            >
              <span className="quick-nav-icon" aria-hidden="true">{tile.icon}</span>
              <span className="quick-nav-label">{tile.shortLabel || tile.label}</span>
              {tile.page === 'archive' && archivedCount > 0 && (
                <span className="quick-nav-badge" aria-hidden="true">
                  {archivedCount > 99 ? '99+' : archivedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
});

export default QuickNav;
