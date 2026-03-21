/**
 * Sidebar — Phase 105 Flat 7+1 Navigation
 *
 * Linear-quality sidebar with lucide-react icons.
 * Features:
 * - Flat 7+1 nav: Chat Hub + 7 Smart Pages (no sections)
 * - Active item: left accent bar + subtle background tint + aria-current="page"
 * - Hover: smooth 150ms background transition
 * - Collapsed state: icons only with tooltip
 * - WCAG 2.1 AA Compliant
 */

import { memo, useCallback, useRef, useMemo } from 'react';
import type { Page, ApiStatus } from '../../types';
import { NAV_ITEMS, NAV_HUB_ITEM, isNavItemActive, type NavItem } from '../../navigation';
import { AI_PERSONALITY } from '../../utils/aiPersonality';
import { getPageIcon, LogOut } from '../../utils/navIcons';

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
  emailUnreadCount = 0,
}: SidebarProps) {
  const { signOut } = useAuth();
  const sidebarRef = useRef<HTMLElement>(null);

  const handleNavigate = useCallback((page: Page) => {
    onNavigate(page);
  }, [onNavigate]);

  // Resolve badge values
  const badgeValues = useMemo(() => {
    const values: Record<string, number | undefined> = {};
    for (const item of NAV_ITEMS) {
      if (!item.badge) continue;
      if (item.badge === 'email_unread') values[item.page] = emailUnreadCount > 0 ? emailUnreadCount : undefined;
    }
    return values;
  }, [emailUnreadCount]);

  const getBadgeValue = (item: NavItem): number | undefined => {
    return badgeValues[item.page];
  };

  // Check if hub is active (hub, home, chat, dashboard, browser, screen-memory, agent-teams)
  const isHubActive = useMemo(() => {
    const hubPages: Page[] = ['hub', 'home', 'chat', 'dashboard', 'browser', 'screen-memory', 'agent-teams'];
    return hubPages.includes(currentPage);
  }, [currentPage]);

  /** Keyboard navigation: ArrowUp/ArrowDown between nav items, Home/End for first/last */
  const handleNavKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    e.preventDefault();
    const nav = sidebarRef.current;
    if (!nav) return;
    const items = Array.from(nav.querySelectorAll<HTMLElement>(
      '.sidebar-nav-item'
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
          onClick={() => handleNavigate('hub')}
          title="Chat Hub"
          aria-label="Zum Chat Hub"
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

      {/* Hub Item — prominent */}
      <div className="sidebar-hub">
        <button
          type="button"
          className={`sidebar-nav-item sidebar-hub-item neuro-focus-ring ${isHubActive ? 'active' : ''}`}
          onClick={() => handleNavigate('hub')}
          title={collapsed ? `${NAV_HUB_ITEM.label}: ${NAV_HUB_ITEM.description}` : undefined}
          aria-current={isHubActive ? 'page' : undefined}
          aria-label={NAV_HUB_ITEM.label}
        >
          <span className="sidebar-item-icon" aria-hidden="true">{renderIcon('hub')}</span>
          {!collapsed && <span className="sidebar-item-label">{NAV_HUB_ITEM.label}</span>}
        </button>
      </div>

      {/* Divider */}
      <div className="sidebar-divider" aria-hidden="true" />

      {/* 7 Smart Page Nav Items — flat list */}
      <div className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = isNavItemActive(item, currentPage);
          const badge = getBadgeValue(item);

          return (
            <button
              key={item.page}
              type="button"
              className={`sidebar-nav-item neuro-focus-ring ${isActive ? 'active' : ''}`}
              onClick={() => handleNavigate(item.page)}
              title={collapsed ? `${item.label}${item.description ? ': ' + item.description : ''}` : undefined}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              <span className="sidebar-item-icon" aria-hidden="true">{renderIcon(item.page)}</span>
              {!collapsed && (
                <>
                  <span className="sidebar-item-label">{item.label}</span>
                  {badge !== undefined && (
                    <span className="sidebar-item-badge" aria-label={`${badge} Eintraege`}>{badge}</span>
                  )}
                </>
              )}
              {collapsed && badge !== undefined && (
                <span className="sidebar-item-badge-dot" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer: Status + Logout */}
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

        {/* Plan Badge */}
        {!collapsed && (
          <div className="sidebar-plan-badge">
            {localStorage.getItem('zenai_demo') === 'true' ? 'Pro (Demo)' : 'Free Plan'}
          </div>
        )}

        {/* Logout */}
        <div className="sidebar-footer-items">
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
