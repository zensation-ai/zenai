/**
 * HubPage - Unified page layout for all tabbed pages
 *
 * Replaces 7+ different tab implementations with a single,
 * consistent component. Provides:
 * - PageHeader with back button
 * - Tab navigation bar (hub-tabs pattern)
 * - Content area
 * - RisingBubbles background
 * - Responsive mobile tabs (icons-only on small screens)
 * - ARIA-compliant tab roles
 * - Optional badge support per tab
 */

import { memo, useCallback, useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import type { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { RisingBubbles } from './RisingBubbles';
import type { BreadcrumbItem } from './Breadcrumbs';
import type { Page } from '../types';
import './shared-tabs.css';

export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  icon: string;
  badge?: number | string;
  description?: string;
}

interface HubPageProps<T extends string> {
  /** Page title shown in header */
  title: string;
  /** Emoji icon for the header */
  icon: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Tab definitions */
  tabs: readonly TabDef<T>[];
  /** Currently active tab */
  activeTab: T;
  /** Called when a tab is clicked */
  onTabChange: (tab: T) => void;
  /** Back button handler */
  onBack: () => void;
  /** Optional back button label */
  backLabel?: string;
  /** Current AI context for data-context attribute */
  context?: AIContext;
  /** Tab content (rendered inside hub-content) */
  children: ReactNode;
  /** Optional content for the right side of the header */
  headerActions?: ReactNode;
  /** Optional breadcrumbs */
  breadcrumbs?: BreadcrumbItem[];
  /** Navigation handler for breadcrumbs */
  onNavigate?: (page: Page) => void;
  /** Hide the rising bubbles background */
  noBubbles?: boolean;
  /** ARIA label for tab navigation */
  ariaLabel?: string;
}

function HubPageComponent<T extends string>({
  title,
  icon,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  backLabel,
  context,
  children,
  headerActions,
  breadcrumbs,
  onNavigate,
  noBubbles,
  ariaLabel,
}: HubPageProps<T>) {
  const tabListRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ left: false, right: false });

  const updateScrollIndicators = useCallback(() => {
    const el = tabListRef.current;
    if (!el) return;
    setScrollState({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = tabListRef.current;
    if (!el) return;
    updateScrollIndicators();
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    const ro = new ResizeObserver(updateScrollIndicators);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollIndicators); ro.disconnect(); };
  }, [updateScrollIndicators, tabs]);

  const handleTabKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab);
    let nextIndex = -1;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    if (nextIndex >= 0) {
      onTabChange(tabs[nextIndex].id);
      // Focus the new tab button
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIndex]?.focus();
      // Scroll into view
      buttons?.[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [tabs, activeTab, onTabChange]);

  const tabPanelId = `${title.replace(/\s+/g, '-').toLowerCase()}-tabpanel`;
  const activeTabId = `tab-${activeTab}`;

  return (
    <div className="hub-page" data-context={context}>
      {!noBubbles && <RisingBubbles variant="subtle" />}
      <PageHeader
        title={title}
        icon={icon}
        subtitle={subtitle}
        onBack={onBack}
        backLabel={backLabel}
        breadcrumbs={breadcrumbs}
        onNavigate={onNavigate}
      >
        {headerActions}
      </PageHeader>

      <div
        ref={wrapperRef}
        className={`hub-tabs-wrapper${scrollState.left ? ' can-scroll-left' : ''}${scrollState.right ? ' can-scroll-right' : ''}`}
      >
        <nav className="hub-tabs" role="tablist" aria-label={ariaLabel || `${title} Navigation`} ref={tabListRef}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={tabPanelId}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`hub-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={handleTabKeyDown}
              title={tab.description}
            >
              <span className="hub-tab-icon" aria-hidden="true">{tab.icon}</span>
              <span className="hub-tab-label">{tab.label}</span>
              {tab.badge != null && (
                <span className="hub-tab-badge" aria-label={`${tab.badge}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="hub-content" role="tabpanel" id={tabPanelId} aria-labelledby={activeTabId}>
        {children}
      </main>
    </div>
  );
}

export const HubPage = memo(HubPageComponent) as typeof HubPageComponent;
