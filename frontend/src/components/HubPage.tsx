/**
 * HubPage - Unified page layout for all tabbed pages
 *
 * Provides: PageHeader + Tab navigation + Content area
 * Responsive, ARIA-compliant, badge support per tab.
 */

import { memo, useCallback, useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import type { AIContext } from './ContextSwitcher';
import type { Page } from '../types';
import { PageHeader } from './PageHeader';
import { cn } from '@/lib/utils';

export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  icon: string;
  badge?: number | string;
  description?: string;
}

interface HubPageProps<T extends string> {
  title: string;
  icon: string;
  subtitle?: string;
  tabs: readonly TabDef<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  onBack: () => void;
  backLabel?: string;
  context?: AIContext;
  children: ReactNode;
  headerActions?: ReactNode;
  noBubbles?: boolean;
  ariaLabel?: string;
  onNavigate?: (page: Page) => void;
}

function HubPageComponent<T extends string>({
  title,
  icon,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  context,
  children,
  headerActions,
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
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIndex]?.focus();
      buttons?.[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [tabs, activeTab, onTabChange]);

  const tabPanelId = `${title.replace(/\s+/g, '-').toLowerCase()}-tabpanel`;
  const activeTabId = `tab-${activeTab}`;

  return (
    <div className="flex flex-col h-full relative" data-context={context}>
      <PageHeader
        title={title}
        icon={icon}
        subtitle={subtitle}
        onBack={onBack}
      >
        {headerActions}
      </PageHeader>

      {/* Tab bar */}
      <div
        ref={wrapperRef}
        className={cn(
          'relative',
          scrollState.left && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-8 before:bg-gradient-to-r before:from-bg before:to-transparent before:z-10 before:pointer-events-none',
          scrollState.right && 'after:absolute after:right-0 after:top-0 after:bottom-0 after:w-8 after:bg-gradient-to-l after:from-bg after:to-transparent after:z-10 after:pointer-events-none',
        )}
      >
        <nav
          className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin border-b border-border/60"
          role="tablist"
          aria-label={ariaLabel || `${title} Navigation`}
          ref={tabListRef}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={tabPanelId}
                aria-label={tab.label}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2.5 border-none cursor-pointer transition-all duration-150 whitespace-nowrap text-[13px] font-medium shrink-0',
                  'bg-transparent -mb-px',
                  isActive
                    ? 'text-text'
                    : 'text-text-muted hover:text-text-secondary',
                )}
                onClick={() => onTabChange(tab.id)}
                onKeyDown={handleTabKeyDown}
                title={tab.description}
              >
                <span className="text-sm" aria-hidden="true">{tab.icon}</span>
                <span className="max-xs:hidden">{tab.label}</span>
                {tab.badge != null && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-2xs font-semibold bg-primary/15 text-primary">
                    {tab.badge}
                  </span>
                )}
                {/* Active indicator line */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto" role="tabpanel" id={tabPanelId} aria-labelledby={activeTabId}>
        {children}
      </div>
    </div>
  );
}

export const HubPage = memo(HubPageComponent) as typeof HubPageComponent;
