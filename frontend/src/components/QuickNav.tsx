import type { Page } from '../types';
import './QuickNav.css';

interface QuickNavTile {
  page: Page;
  icon: string;
  label: string;
  color?: string;
}

const QUICK_NAV_TILES: QuickNavTile[] = [
  { page: 'ideas', icon: '💭', label: 'Gedanken', color: 'primary' },
  { page: 'insights', icon: '📊', label: 'Insights', color: 'blue' },
  { page: 'ai-workshop', icon: '🧠', label: 'KI-Werkstatt', color: 'purple' },
  { page: 'archive', icon: '📥', label: 'Archiv', color: 'gray' },
  { page: 'learning', icon: '📚', label: 'Lernen', color: 'green' },
  { page: 'meetings', icon: '📅', label: 'Meetings', color: 'cyan' },
  { page: 'personalization', icon: '💬', label: 'Chat', color: 'coral' },
];

interface QuickNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  archivedCount?: number;
}

export function QuickNav({ currentPage, onNavigate, archivedCount = 0 }: QuickNavProps) {
  return (
    <nav className="quick-nav" aria-label="Schnellzugriff">
      <div className="quick-nav-content">
        {QUICK_NAV_TILES.map((tile) => {
          const isActive = currentPage === tile.page ||
            (tile.page === 'insights' && ['dashboard', 'analytics', 'digest', 'knowledge-graph'].includes(currentPage)) ||
            (tile.page === 'ai-workshop' && ['incubator', 'proactive', 'evolution'].includes(currentPage));

          return (
            <button
              key={tile.page}
              type="button"
              className={`quick-nav-tile ${isActive ? 'active' : ''} color-${tile.color}`}
              onClick={() => onNavigate(tile.page)}
              aria-current={isActive ? 'page' : undefined}
              title={tile.label}
            >
              <span className="quick-nav-icon" aria-hidden="true">{tile.icon}</span>
              <span className="quick-nav-label">{tile.label}</span>
              {tile.page === 'archive' && archivedCount > 0 && (
                <span className="quick-nav-badge" aria-label={`${archivedCount} archiviert`}>
                  {archivedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
