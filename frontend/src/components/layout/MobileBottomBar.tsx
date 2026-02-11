/**
 * MobileBottomBar - Mobile Bottom Tab Navigation
 *
 * Fixed bottom bar with 5 tabs, visible only on mobile (< 768px).
 * Neuro-optimiert: Chat-Button hervorgehoben als Dopamin-Trigger.
 */

import { memo } from 'react';
import type { Page } from '../../types';
import './MobileBottomBar.css';

interface MobileBottomBarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenMore: () => void;
}

interface BottomTab {
  id: string;
  icon: string;
  label: string;
  page?: Page;
  isSpecial?: 'more';
}

const BOTTOM_TABS: BottomTab[] = [
  { id: 'home', icon: '🏠', label: 'Home', page: 'home' },
  { id: 'ideas', icon: '💭', label: 'Gedanken', page: 'ideas' },
  { id: 'chat', icon: '💬', label: 'Chat', page: 'chat' },
  { id: 'insights', icon: '📊', label: 'Entdecken', page: 'insights' },
  { id: 'more', icon: '☰', label: 'Mehr', isSpecial: 'more' },
];

export const MobileBottomBar = memo(function MobileBottomBar({
  currentPage,
  onNavigate,
  onOpenMore,
}: MobileBottomBarProps) {
  const handleClick = (tab: BottomTab) => {
    if (tab.isSpecial === 'more') {
      onOpenMore();
    } else if (tab.page) {
      onNavigate(tab.page);
    }
  };

  const isActive = (tab: BottomTab): boolean => {
    if (tab.isSpecial) return false;
    return currentPage === tab.page;
  };

  return (
    <nav className="mobile-bottom-bar" role="tablist" aria-label="Schnellnavigation">
      {BOTTOM_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={`bottom-tab ${isActive(tab) ? 'active' : ''} ${tab.page === 'chat' ? 'chat-tab' : ''} ${tab.isSpecial === 'more' ? 'more-tab' : ''}`}
          onClick={() => handleClick(tab)}
          aria-selected={isActive(tab)}
          aria-label={tab.label}
        >
          <span className={`bottom-tab-icon ${tab.page === 'chat' ? 'chat-icon' : ''}`} aria-hidden="true">
            {tab.isSpecial === 'more' ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : tab.icon}
          </span>
          <span className="bottom-tab-label">{tab.label}</span>
          {isActive(tab) && <span className="bottom-tab-indicator" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
});

export default MobileBottomBar;
