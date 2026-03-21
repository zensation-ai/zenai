/**
 * MobileBottomBar - Mobile Bottom Tab Navigation
 *
 * Fixed bottom bar with 5 tabs, visible only on mobile (< 768px).
 * Phase 105: Updated to Chat, Ideen, Planer, Inbox, Mehr.
 */

import { memo, useMemo } from 'react';
import type { Page } from '../../types';
import { haptic } from '../../utils/haptics';
import './MobileBottomBar.css';

interface MobileBottomBarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenMore: () => void;
  emailUnreadCount?: number;
  notificationCount?: number;
}

interface BottomTab {
  id: string;
  label: string;
  page?: Page;
  isSpecial?: 'more';
}

const BOTTOM_TABS: BottomTab[] = [
  { id: 'hub', label: 'Chat', page: 'hub' },
  { id: 'ideas', label: 'Ideen', page: 'ideas' },
  { id: 'calendar', label: 'Planer', page: 'calendar' },
  { id: 'email', label: 'Inbox', page: 'email' },
  { id: 'more', label: 'Mehr', isSpecial: 'more' },
];

// Hub tab active pages
const HUB_ACTIVE_PAGES: Page[] = ['hub', 'home', 'chat', 'dashboard', 'browser', 'screen-memory', 'agent-teams'];
// Ideas tab active pages
const IDEAS_ACTIVE_PAGES: Page[] = ['ideas', 'workshop', 'incubator', 'archive', 'triage', 'proactive', 'evolution', 'ai-workshop'];
// Calendar tab active pages
const CALENDAR_ACTIVE_PAGES: Page[] = ['calendar', 'tasks', 'kanban', 'gantt', 'meetings', 'contacts', 'learning-tasks'];
// Email tab active pages
const EMAIL_ACTIVE_PAGES: Page[] = ['email', 'notifications'];

/** SVG icons for each tab — 24x24 viewBox, stroke-based */
function TabIcon({ id, active }: { id: string; active: boolean }) {
  const color = active ? 'currentColor' : 'currentColor';
  const weight = active ? '2' : '1.5';

  switch (id) {
    case 'hub':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'ideas':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
        </svg>
      );
    case 'calendar':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'email':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polyline points="22 7 12 13 2 7" />
        </svg>
      );
    case 'more':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      );
    default:
      return null;
  }
}

export const MobileBottomBar = memo(function MobileBottomBar({
  currentPage,
  onNavigate,
  onOpenMore,
  emailUnreadCount = 0,
}: MobileBottomBarProps) {
  const handleClick = (tab: BottomTab) => {
    haptic('selection');
    if (tab.isSpecial === 'more') {
      onOpenMore();
    } else if (tab.page) {
      onNavigate(tab.page);
    }
  };

  const isActive = (tab: BottomTab): boolean => {
    if (tab.isSpecial) return false;
    switch (tab.id) {
      case 'hub': return HUB_ACTIVE_PAGES.includes(currentPage);
      case 'ideas': return IDEAS_ACTIVE_PAGES.includes(currentPage);
      case 'calendar': return CALENDAR_ACTIVE_PAGES.includes(currentPage);
      case 'email': return EMAIL_ACTIVE_PAGES.includes(currentPage);
      default: return currentPage === tab.page;
    }
  };

  // Calculate active tab index for the sliding indicator
  const activeIndex = useMemo(() => {
    return BOTTOM_TABS.findIndex(tab => !tab.isSpecial && isActive(tab));
  // Intentionally omit isActive — derived from currentPage, including it would be redundant
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  return (
    <nav className="mobile-bottom-bar" role="tablist" aria-label="Schnellnavigation">
      {/* Sliding indicator */}
      {activeIndex >= 0 && (
        <span
          className="bottom-bar-slide-indicator"
          style={{
            transform: `translateX(${activeIndex * 100}%)`,
            width: `${100 / BOTTOM_TABS.length}%`,
          }}
          aria-hidden="true"
        />
      )}

      {BOTTOM_TABS.map((tab) => {
        const active = isActive(tab);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`bottom-tab ${active ? 'active' : ''} ${tab.id === 'hub' ? 'chat-tab' : ''} ${tab.isSpecial === 'more' ? 'more-tab' : ''}`}
            onClick={() => handleClick(tab)}
            aria-selected={active}
            aria-label={tab.label}
          >
            <span className={`bottom-tab-icon ${tab.id === 'hub' ? 'chat-icon' : ''}`} aria-hidden="true">
              <TabIcon id={tab.id} active={active} />
            </span>
            <span className={`bottom-tab-label ${active ? 'label-visible' : ''}`}>
              {tab.label}
            </span>
            {tab.id === 'email' && emailUnreadCount > 0 && (
              <span className="bottom-tab-badge" aria-label={`${emailUnreadCount} ungelesene E-Mails`}>
                {emailUnreadCount > 99 ? '99+' : emailUnreadCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
});

export default MobileBottomBar;
