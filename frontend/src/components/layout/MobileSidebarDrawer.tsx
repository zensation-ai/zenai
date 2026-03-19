/**
 * MobileSidebarDrawer — Phase 105 Flat 7+1 Navigation
 *
 * Slide-in drawer from left with flat nav list.
 * Reuses patterns: Portal, focus trap, body scroll lock, stagger animations.
 */

import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Page } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { ContextSwitcher } from '../ContextSwitcher';
import { ThemeToggle } from '../ThemeToggle';
import { NAV_ITEMS, NAV_HUB_ITEM, isNavItemActive, type NavItem } from '../../navigation';
import { AI_PERSONALITY } from '../../utils/aiPersonality';
import { getIconByName } from '../../utils/navIcons';
import { BrainLogo } from './BrainLogo';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './MobileSidebarDrawer.css';

/** Render a nav item icon from its Lucide name string */
function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = getIconByName(name);
  return <Icon size={size} strokeWidth={1.5} />;
}

interface MobileSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  archivedCount: number;
  notificationCount: number;
  emailUnreadCount?: number;
  isAIActive: boolean;
  favoritePages?: Page[];
  toggleFavorite?: (page: Page) => void;
  isFavorited?: (page: Page) => boolean;
}

const STAGGER_DELAY = 25;

// Hub active pages
const HUB_ACTIVE_PAGES: Page[] = ['hub', 'home', 'chat', 'dashboard', 'browser', 'screen-memory', 'agent-teams'];

export function MobileSidebarDrawer({
  isOpen,
  onClose,
  currentPage,
  onNavigate,
  context,
  onContextChange,
  emailUnreadCount = 0,
  isAIActive,
}: MobileSidebarDrawerProps) {
  const drawerRef = useFocusTrap<HTMLElement>({ isActive: isOpen, onEscape: onClose });

  // Close on Escape + body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    onClose();
  };

  const getBadgeValue = (item: NavItem): number | undefined => {
    if (item.badge === 'email_unread') return emailUnreadCount > 0 ? emailUnreadCount : undefined;
    return undefined;
  };

  const isHubActive = HUB_ACTIVE_PAGES.includes(currentPage);

  let globalIndex = 0;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`msd-backdrop ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <nav
        ref={drawerRef}
        className={`msd-drawer ${isOpen ? 'open' : ''}`}
        role="navigation"
        aria-label="Hauptnavigation"
      >
        {/* Header */}
        <div className="msd-header">
          <div className="msd-title-area">
            <span className="msd-logo" aria-hidden="true">
              <BrainLogo size={28} />
            </span>
            <span className={`msd-logo-dot ${isAIActive ? 'active' : ''}`} aria-hidden="true" />
            <span className="msd-title">{AI_PERSONALITY.name}</span>
          </div>
          <button
            type="button"
            className="msd-close neuro-focus-ring"
            onClick={onClose}
            aria-label="Menue schliessen"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Context Switcher + Theme */}
        <div className="msd-controls">
          <ContextSwitcher context={context} onContextChange={onContextChange} />
          <ThemeToggle className="compact" />
        </div>

        {/* Hub Item — prominent */}
        <div className="msd-hub">
          <button
            type="button"
            className={`msd-item msd-hub-item neuro-focus-ring ${isHubActive ? 'active' : ''}`}
            onClick={() => handleNavigate('hub')}
            aria-current={isHubActive ? 'page' : undefined}
            style={{ '--stagger-delay': `${globalIndex++ * STAGGER_DELAY}ms` } as CSSProperties}
          >
            <span className="msd-item-icon"><NavIcon name={NAV_HUB_ITEM.icon} /></span>
            <span className="msd-item-label">{NAV_HUB_ITEM.label}</span>
            {isHubActive && <span className="msd-item-check" aria-hidden="true">&#10003;</span>}
          </button>
        </div>

        {/* Divider */}
        <div className="msd-divider" aria-hidden="true" />

        {/* 7 Smart Page Nav Items — flat list */}
        <div className="msd-content">
          {NAV_ITEMS.map((item) => {
            const isActive = isNavItemActive(item, currentPage);
            const badge = getBadgeValue(item);
            const idx = globalIndex++;

            return (
              <button
                key={item.page}
                type="button"
                className={`msd-item neuro-focus-ring ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigate(item.page)}
                aria-current={isActive ? 'page' : undefined}
                style={{ '--item-delay': `${idx * STAGGER_DELAY}ms` } as CSSProperties}
              >
                <span className="msd-item-icon"><NavIcon name={item.icon} /></span>
                <span className="msd-item-text">
                  <span className="msd-item-label">{item.label}</span>
                  {item.description && (
                    <span className="msd-item-description">{item.description}</span>
                  )}
                </span>
                {badge !== undefined && <span className="msd-item-badge">{badge}</span>}
                {isActive && <span className="msd-item-check" aria-hidden="true">&#10003;</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </>,
    document.body
  );
}

export default MobileSidebarDrawer;
