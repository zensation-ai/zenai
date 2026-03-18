/**
 * MobileSidebarDrawer - Mobile Navigation Drawer
 *
 * Slide-in drawer from left, replacing the old MobileNav.
 * Reuses patterns from MobileNav: Portal, focus trap, body scroll lock, stagger animations.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Page } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { ContextSwitcher } from '../ContextSwitcher';
import { ThemeToggle } from '../ThemeToggle';
import { NAV_SECTIONS, NAV_FOOTER_ITEMS, NAV_CHAT_ITEM, NAV_BROWSER_ITEM, isNavItemActive, getNavItemByPage, type NavItem } from '../../navigation';
import { AI_PERSONALITY } from '../../utils/aiPersonality';
import { safeLocalStorage } from '../../utils/storage';
import { getIconByName } from '../../utils/navIcons';
import { BrainLogo } from './BrainLogo';
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

export function MobileSidebarDrawer({
  isOpen,
  onClose,
  currentPage,
  onNavigate,
  context,
  onContextChange,
  archivedCount,
  notificationCount,
  emailUnreadCount = 0,
  isAIActive,
  favoritePages,
  toggleFavorite,
}: MobileSidebarDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    try {
      const stored = safeLocalStorage('get', 'sidebar-expanded');
      return stored ? new Set(JSON.parse(stored)) : new Set([...NAV_SECTIONS.map(s => s.id), 'favorites', 'recents']);
    } catch {
      return new Set([...NAV_SECTIONS.map(s => s.id), 'favorites', 'recents']);
    }
  });

  // Close on Escape
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

  // Focus trap
  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;

    const focusable = drawerRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    first?.focus();
    document.addEventListener('keydown', handleTab);

    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    onClose();
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      safeLocalStorage('set', 'sidebar-expanded', JSON.stringify([...next]));
      return next;
    });
  };

  const getBadgeValue = (item: NavItem): number | undefined => {
    if (item.badge === 'archived') return archivedCount > 0 ? archivedCount : undefined;
    if (item.badge === 'notifications') return notificationCount > 0 ? notificationCount : undefined;
    if (item.badge === 'email_unread') return emailUnreadCount > 0 ? emailUnreadCount : undefined;
    return undefined;
  };

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
            aria-label="Menü schließen"
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

        {/* Dashboard Link */}
        <div className="msd-dashboard">
          <button
            type="button"
            className={`msd-item neuro-focus-ring ${currentPage === 'home' ? 'active' : ''}`}
            onClick={() => handleNavigate('home')}
            aria-current={currentPage === 'home' ? 'page' : undefined}
            style={{ '--stagger-delay': `${globalIndex++ * STAGGER_DELAY}ms` } as CSSProperties}
          >
            <span className="msd-item-icon">🏠</span>
            <span className="msd-item-label">Dashboard</span>
            {currentPage === 'home' && <span className="msd-item-check" aria-hidden="true">✓</span>}
          </button>
        </div>

        {/* Chat - Prominent */}
        <div className="msd-chat">
          <button
            type="button"
            className={`msd-item msd-chat-item neuro-focus-ring ${currentPage === 'chat' ? 'active' : ''}`}
            onClick={() => handleNavigate('chat')}
            aria-current={currentPage === 'chat' ? 'page' : undefined}
            style={{ '--stagger-delay': `${globalIndex++ * STAGGER_DELAY}ms` } as CSSProperties}
          >
            <span className="msd-item-icon"><NavIcon name={NAV_CHAT_ITEM.icon} /></span>
            <span className="msd-item-label">{NAV_CHAT_ITEM.label}</span>
            {currentPage === 'chat' && <span className="msd-item-check" aria-hidden="true">✓</span>}
          </button>
          <button
            type="button"
            className={`msd-item msd-browser-item neuro-focus-ring ${currentPage === 'browser' ? 'active' : ''}`}
            onClick={() => handleNavigate('browser')}
            aria-current={currentPage === 'browser' ? 'page' : undefined}
            style={{ '--stagger-delay': `${globalIndex++ * STAGGER_DELAY}ms` } as CSSProperties}
          >
            <span className="msd-item-icon"><NavIcon name={NAV_BROWSER_ITEM.icon} /></span>
            <span className="msd-item-label">{NAV_BROWSER_ITEM.label}</span>
            {currentPage === 'browser' && <span className="msd-item-check" aria-hidden="true">✓</span>}
          </button>
        </div>

        {/* Navigation Content */}
        <div className="msd-content">
          {/* Favorites */}
          {favoritePages && favoritePages.length > 0 && (
            <div className={`msd-section ${expandedSections.has('favorites') ? 'expanded' : ''}`}>
              <button
                type="button"
                className="msd-section-header neuro-focus-ring"
                onClick={() => toggleSection('favorites')}
                aria-expanded={expandedSections.has('favorites')}
              >
                <span className="msd-section-icon">⭐</span>
                <span className="msd-section-label">Favoriten</span>
                <span className="msd-section-count">{favoritePages.length}</span>
                <svg
                  className={`msd-section-chevron ${expandedSections.has('favorites') ? 'rotated' : ''}`}
                  width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                >
                  <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className={`msd-section-items ${expandedSections.has('favorites') ? 'visible' : ''}`}>
                {favoritePages.map(page => {
                  const navItem = getNavItemByPage(page);
                  if (!navItem) return null;
                  const isActive = currentPage === page;
                  return (
                    <div key={`fav-${page}`} className="msd-item-wrapper">
                      <button
                        type="button"
                        className={`msd-item nested neuro-focus-ring ${isActive ? 'active' : ''}`}
                        onClick={() => handleNavigate(page)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className="msd-item-icon"><NavIcon name={navItem.icon} /></span>
                        <span className="msd-item-label">{navItem.label}</span>
                        {isActive && <span className="msd-item-check" aria-hidden="true">✓</span>}
                      </button>
                      {toggleFavorite && (
                        <button
                          type="button"
                          className="msd-favorite-btn neuro-focus-ring"
                          onClick={() => toggleFavorite(page)}
                          aria-label={`${navItem.label} aus Favoriten entfernen`}
                          title="Aus Favoriten entfernen"
                        >
                          <span aria-hidden="true">★</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {NAV_SECTIONS.map((section) => {
            const isExpanded = expandedSections.has(section.id);

            return (
              <div key={section.id} className={`msd-section ${isExpanded ? 'expanded' : ''}`}>
                <button
                  type="button"
                  className="msd-section-header neuro-focus-ring"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="msd-section-icon"><NavIcon name={section.icon} /></span>
                  <span className="msd-section-label">{section.label}</span>
                  <span className="msd-section-count">{section.items.length}</span>
                  <svg
                    className={`msd-section-chevron ${isExpanded ? 'rotated' : ''}`}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                  >
                    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className={`msd-section-items ${isExpanded ? 'visible' : ''}`}>
                  {section.items.map((item) => {
                    const isActive = isNavItemActive(item, currentPage);
                    const badge = getBadgeValue(item);
                    const idx = globalIndex++;

                    return (
                      <button
                        key={item.page}
                        type="button"
                        className={`msd-item nested neuro-focus-ring ${isActive ? 'active' : ''}`}
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
                        {isActive && <span className="msd-item-check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Items */}
        <div className="msd-footer">
          {NAV_FOOTER_ITEMS.map((item) => {
            const isActive = currentPage === item.page;

            return (
              <button
                key={item.page}
                type="button"
                className={`msd-item neuro-focus-ring ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigate(item.page)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="msd-item-icon"><NavIcon name={item.icon} /></span>
                <span className="msd-item-label">{item.label}</span>
                {isActive && <span className="msd-item-check" aria-hidden="true">✓</span>}
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
