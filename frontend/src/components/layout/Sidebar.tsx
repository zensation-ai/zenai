/**
 * Sidebar - Premium Navigation
 *
 * Linear-quality sidebar with lucide-react icons.
 * Features:
 * - Clean icon-based navigation (no emojis)
 * - Active item: left accent bar + subtle background tint
 * - Hover: smooth 150ms background transition
 * - Section headers: uppercase, letter-spaced, muted
 * - Collapsed state: icons only with tooltip
 * - WCAG 2.1 AA Compliant
 */

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Page, ApiStatus } from '../../types';
import { NAV_SECTIONS, NAV_FOOTER_ITEMS, NAV_CHAT_ITEM, NAV_BROWSER_ITEM, isNavItemActive, getNavItemByPage, type NavItem, type NavSection } from '../../navigation';
import { AI_PERSONALITY } from '../../utils/aiPersonality';
import { getPageIcon, LogOut, Star, ChevronDown } from '../../utils/navIcons';

import { safeLocalStorage } from '../../utils/storage';
import { useAuth } from '../../contexts/AuthContext';
import { BrainLogo } from './BrainLogo';
import './Sidebar.css';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  apiStatus: ApiStatus | null;
  isAIActive: boolean;
  aiActivityMessage?: string;
  archivedCount: number;
  notificationCount: number;
  emailUnreadCount?: number;
  favoritePages?: Page[];
  toggleFavorite?: (page: Page) => void;
  isFavorited?: (page: Page) => boolean;
}

export const Sidebar = memo(function Sidebar({
  collapsed,
  onToggleCollapse,
  currentPage,
  onNavigate,
  apiStatus,
  isAIActive,
  aiActivityMessage,
  archivedCount,
  notificationCount,
  emailUnreadCount = 0,
  favoritePages,
  toggleFavorite,
  isFavorited,
}: SidebarProps) {
  // Track which sections are expanded (all expanded by default)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    try {
      const stored = safeLocalStorage('get', 'sidebar-expanded');
      return stored ? new Set(JSON.parse(stored)) : new Set([...NAV_SECTIONS.map(s => s.id), 'favorites', 'recents']);
    } catch {
      return new Set([...NAV_SECTIONS.map(s => s.id), 'favorites', 'recents']);
    }
  });

  const { signOut } = useAuth();
  const sidebarRef = useRef<HTMLElement>(null);

  // Persist expanded sections
  useEffect(() => {
    safeLocalStorage('set', 'sidebar-expanded', JSON.stringify([...expandedSections]));
  }, [expandedSections]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const handleNavigate = useCallback((page: Page) => {
    onNavigate(page);
  }, [onNavigate]);

  // Resolve badge values — memoized to avoid recalculating on every render
  const badgeValues = useMemo(() => {
    const values: Record<string, number | undefined> = {};
    const allItems = [...NAV_SECTIONS.flatMap(s => s.items), ...NAV_FOOTER_ITEMS];
    for (const item of allItems) {
      if (!item.badge) continue;
      if (item.badge === 'archived') values[item.page] = archivedCount > 0 ? archivedCount : undefined;
      else if (item.badge === 'notifications') values[item.page] = notificationCount > 0 ? notificationCount : undefined;
      else if (item.badge === 'email_unread') values[item.page] = emailUnreadCount > 0 ? emailUnreadCount : undefined;
    }
    return values;
  }, [archivedCount, notificationCount, emailUnreadCount]);

  const getBadgeValue = (item: NavItem): number | undefined => {
    return badgeValues[item.page];
  };

  // Check if section contains active page
  const isSectionActive = (section: NavSection): boolean => {
    return section.items.some(item => isNavItemActive(item, currentPage));
  };

  /** Keyboard navigation: ArrowUp/ArrowDown between nav items, Home/End for first/last */
  const handleNavKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    e.preventDefault();
    const nav = sidebarRef.current;
    if (!nav) return;
    const items = Array.from(nav.querySelectorAll<HTMLElement>(
      '.sidebar-item, .sidebar-footer-item'
    ));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next = idx;
    if (key === 'ArrowDown') next = idx < items.length - 1 ? idx + 1 : 0;
    else if (key === 'ArrowUp') next = idx > 0 ? idx - 1 : items.length - 1;
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = items.length - 1;
    items[next]?.focus();
  }, []);

  /** Render a lucide icon for a nav item */
  const renderIcon = (page: Page, size: number = 18) => {
    const IconComponent = getPageIcon(page);
    return <IconComponent size={size} strokeWidth={1.5} />;
  };

  return (
    <aside
      ref={sidebarRef}
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      role="navigation"
      aria-label="Hauptnavigation"
      onKeyDown={handleNavKeyDown}
    >
      {/* Header: Logo + Collapse Toggle */}
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-logo-btn"
          onClick={() => handleNavigate('home')}
          title="Dashboard"
          aria-label="Zum Dashboard"
        >
          <BrainLogo size={32} className="sidebar-logo-svg" />
          <span
            className={`sidebar-logo-dot ${isAIActive ? 'active' : ''}`}
            aria-hidden="true"
            title={isAIActive && aiActivityMessage ? aiActivityMessage : undefined}
          />
          {isAIActive && aiActivityMessage && !collapsed && (
            <span className="sidebar-brain-tooltip">{aiActivityMessage}</span>
          )}
        </button>
        {!collapsed && <span className="sidebar-logo-text">{AI_PERSONALITY.name}</span>}
        <button
          type="button"
          className="sidebar-collapse-btn neuro-focus-ring"
          onClick={onToggleCollapse}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d={collapsed ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Dashboard Link */}
      <div className="sidebar-dashboard">
        <button
          type="button"
          className={`sidebar-item neuro-focus-ring ${currentPage === 'home' ? 'active' : ''}`}
          onClick={() => handleNavigate('home')}
          title="Dashboard"
          aria-current={currentPage === 'home' ? 'page' : undefined}
        >
          <span className="sidebar-item-icon" aria-hidden="true">{renderIcon('home')}</span>
          {!collapsed && <span className="sidebar-item-label">Dashboard</span>}
        </button>
      </div>

      {/* Chat - Prominent */}
      <div className="sidebar-chat">
        <button
          type="button"
          className={`sidebar-item sidebar-chat-item neuro-focus-ring ${currentPage === 'chat' ? 'active' : ''}`}
          onClick={() => handleNavigate('chat')}
          title={NAV_CHAT_ITEM.description}
          aria-current={currentPage === 'chat' ? 'page' : undefined}
        >
          <span className="sidebar-item-icon" aria-hidden="true">{renderIcon('chat')}</span>
          {!collapsed && <span className="sidebar-item-label">{NAV_CHAT_ITEM.label}</span>}
        </button>
        <button
          type="button"
          className={`sidebar-item sidebar-browser-item neuro-focus-ring ${currentPage === 'browser' ? 'active' : ''}`}
          onClick={() => handleNavigate('browser')}
          title={NAV_BROWSER_ITEM.description}
          aria-current={currentPage === 'browser' ? 'page' : undefined}
        >
          <span className="sidebar-item-icon" aria-hidden="true">{renderIcon('browser')}</span>
          {!collapsed && <span className="sidebar-item-label">{NAV_BROWSER_ITEM.label}</span>}
        </button>
      </div>

      {/* Scrollable Navigation Sections */}
      <div className="sidebar-nav">
        {/* Favorites Section */}
        {!collapsed && favoritePages && favoritePages.length > 0 && (
          <div className="sidebar-section sidebar-favorites">
            <button
              type="button"
              className="sidebar-section-header neuro-focus-ring"
              onClick={() => toggleSection('favorites')}
              aria-expanded={expandedSections.has('favorites')}
            >
              <span className="sidebar-section-label">Favoriten</span>
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                className={`sidebar-section-chevron-icon ${expandedSections.has('favorites') ? 'expanded' : ''}`}
              />
            </button>
            <div className={`sidebar-section-items ${expandedSections.has('favorites') ? 'expanded' : ''}`}>
              {favoritePages.map(page => {
                const navItem = getNavItemByPage(page);
                if (!navItem) return null;
                const isActive = currentPage === page;
                return (
                  <div key={`fav-${page}`} className="sidebar-item-wrapper">
                    <button
                      type="button"
                      className={`sidebar-item neuro-focus-ring ${isActive ? 'active' : ''}`}
                      onClick={() => handleNavigate(page)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="sidebar-item-icon" aria-hidden="true">{renderIcon(page)}</span>
                      <span className="sidebar-item-label">{navItem.label}</span>
                    </button>
                    {toggleFavorite && (
                      <button
                        type="button"
                        className="sidebar-favorite-btn favorited neuro-focus-ring"
                        onClick={() => toggleFavorite(page)}
                        aria-label={`${navItem.label} aus Favoriten entfernen`}
                        aria-pressed={true}
                        title="Aus Favoriten entfernen"
                      >
                        <Star size={12} strokeWidth={1.5} fill="currentColor" />
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
          const hasActive = isSectionActive(section);

          return (
            <div
              key={section.id}
              className={`sidebar-section ${hasActive ? 'has-active' : ''}`}
            >
              {/* Section Header */}
              {!collapsed ? (
                <button
                  type="button"
                  className="sidebar-section-header neuro-focus-ring"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="sidebar-section-label">{section.label}</span>
                  <ChevronDown
                    size={12}
                    strokeWidth={1.5}
                    className={`sidebar-section-chevron-icon ${isExpanded ? 'expanded' : ''}`}
                  />
                </button>
              ) : (
                <div className="sidebar-section-divider" aria-hidden="true" />
              )}

              {/* Section Items */}
              <div className={`sidebar-section-items ${isExpanded || collapsed ? 'expanded' : ''}`}>
                {section.items.map((item) => {
                  const isActive = isNavItemActive(item, currentPage);
                  const badge = getBadgeValue(item);

                  return (
                    <div key={item.page} className="sidebar-item-wrapper">
                      <button
                        type="button"
                        className={`sidebar-item neuro-focus-ring ${isActive ? 'active' : ''}`}
                        onClick={() => handleNavigate(item.page)}
                        title={collapsed ? `${item.label}${item.description ? ': ' + item.description : ''}` : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={item.label}
                      >
                        <span className="sidebar-item-icon" aria-hidden="true">{renderIcon(item.page)}</span>
                        {!collapsed && (
                          <>
                            <span className="sidebar-item-text">
                              <span className="sidebar-item-label">{item.label}</span>
                              {item.description && (
                                <span className="sidebar-item-description">{item.description}</span>
                              )}
                            </span>
                            {badge !== undefined && (
                              <span className="sidebar-item-badge" aria-label={`${badge} Eintraege`}>{badge}</span>
                            )}
                          </>
                        )}
                        {collapsed && badge !== undefined && (
                          <span className="sidebar-item-badge-dot" aria-hidden="true" />
                        )}
                      </button>
                      {!collapsed && toggleFavorite && (
                        <button
                          type="button"
                          className={`sidebar-favorite-btn neuro-focus-ring ${isFavorited?.(item.page) ? 'favorited' : ''}`}
                          onClick={() => toggleFavorite(item.page)}
                          aria-label={isFavorited?.(item.page) ? `${item.label} aus Favoriten entfernen` : `${item.label} zu Favoriten hinzufuegen`}
                          aria-pressed={!!isFavorited?.(item.page)}
                          title={isFavorited?.(item.page) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufuegen'}
                        >
                          <Star size={12} strokeWidth={1.5} fill={isFavorited?.(item.page) ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: Profile, Notifications, Settings */}
      <div className="sidebar-footer">
        {/* Status Indicators */}
        <div className="sidebar-status" aria-label="Systemstatus">
          <span
            className={`sidebar-status-dot ${apiStatus?.database ? 'connected' : 'disconnected'}`}
            title={apiStatus?.database ? 'Datenbank verbunden' : 'Datenbank getrennt'}
            role="status"
            aria-label={apiStatus?.database ? 'Datenbank: verbunden' : 'Datenbank: getrennt'}
          >
            <span className="visually-hidden">{apiStatus?.database ? 'Datenbank verbunden' : 'Datenbank getrennt'}</span>
          </span>
          <span
            className={`sidebar-status-dot ${apiStatus?.ollama ? 'connected' : 'disconnected'}`}
            title={apiStatus?.ollama ? 'KI verbunden' : 'KI getrennt'}
            role="status"
            aria-label={apiStatus?.ollama ? 'KI: aktiv' : 'KI: inaktiv'}
          >
            <span className="visually-hidden">{apiStatus?.ollama ? 'KI verbunden' : 'KI getrennt'}</span>
          </span>
          {!collapsed && <span className="sidebar-status-text">
            {apiStatus?.database ? 'Verbunden' : 'Nicht verbunden'}
          </span>}
        </div>

        {/* Footer Nav Items */}
        <div className="sidebar-footer-items">
          {NAV_FOOTER_ITEMS.map((item) => {
            const isActive = isNavItemActive(item, currentPage);

            return (
              <button
                key={item.page}
                type="button"
                className={`sidebar-footer-item neuro-focus-ring ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigate(item.page)}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
              >
                <span className="sidebar-footer-icon" aria-hidden="true">{renderIcon(item.page, 16)}</span>
                {!collapsed && <span className="sidebar-footer-label">{item.label}</span>}
              </button>
            );
          })}
          <button
            type="button"
            className="sidebar-footer-item sidebar-logout-btn neuro-focus-ring"
            onClick={() => signOut()}
            title="Abmelden"
            aria-label="Abmelden"
          >
            <span className="sidebar-footer-icon" aria-hidden="true"><LogOut size={16} strokeWidth={1.5} /></span>
            {!collapsed && <span className="sidebar-footer-label">Abmelden</span>}
          </button>
        </div>
      </div>
    </aside>
  );
});

export default Sidebar;
