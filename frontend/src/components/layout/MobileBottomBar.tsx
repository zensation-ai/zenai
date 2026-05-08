/**
 * MobileBottomBar - Mobile Bottom Tab Navigation
 *
 * Fixed bottom bar with 5 tabs, visible only on mobile (< 768px).
 * Chunk 4: Home, Gedanken, Chat (FAB), Entdecken, Mehr.
 */

import { memo, useMemo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { Page } from '../../types';
import { haptic } from '../../utils/haptics';

interface MobileBottomBarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenMore?: () => void;
  onOpenSearch?: () => void;
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
  { id: 'home', label: 'Home', page: 'hub' },
  { id: 'ideas', label: 'Gedanken', page: 'ideas' },
  { id: 'chat', label: 'Chat', page: 'hub' },
  { id: 'discover', label: 'Entdecken', page: 'documents' },
  { id: 'more', label: 'Mehr', isSpecial: 'more' },
];

// Home tab active pages
const HOME_ACTIVE_PAGES: Page[] = ['hub', 'home', 'chat', 'browser', 'screen-memory', 'agent-teams'];
// Gedanken tab active pages
const GEDANKEN_ACTIVE_PAGES: Page[] = ['ideas', 'workshop', 'incubator', 'archive', 'triage', 'proactive', 'evolution', 'ai-workshop'];
// Entdecken tab active pages
const DISCOVER_ACTIVE_PAGES: Page[] = ['documents', 'business', 'insights', 'learning', 'my-ai', 'canvas', 'media', 'knowledge-graph', 'graphrag', 'analytics', 'digest', 'social', 'finance', 'billing'];

/** SVG icons for each tab — 24x24 viewBox, stroke-based */
function TabIcon({ id, active }: { id: string; active: boolean }) {
  const weight = active ? '2' : '1.5';

  switch (id) {
    case 'home':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'ideas':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
        </svg>
      );
    case 'chat':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'discover':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    case 'more':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="19" r="1" fill="currentColor" />
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
  onOpenSearch: _onOpenSearch,
  emailUnreadCount = 0,
}: MobileBottomBarProps) {
  const handleClick = (tab: BottomTab) => {
    haptic('selection');
    if (tab.isSpecial === 'more') {
      onOpenMore?.();
    } else if (tab.page) {
      onNavigate(tab.page);
    }
  };

  const isActive = (tab: BottomTab): boolean => {
    if (tab.isSpecial) return false;
    switch (tab.id) {
      case 'home': return HOME_ACTIVE_PAGES.includes(currentPage);
      case 'ideas': return GEDANKEN_ACTIVE_PAGES.includes(currentPage);
      case 'chat': return false; // FAB — no active state
      case 'discover': return DISCOVER_ACTIVE_PAGES.includes(currentPage);
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
    <nav
      className="hidden max-md:flex fixed bottom-0 left-0 right-0 z-header h-[var(--spacing-bottombar,64px)] pb-[env(safe-area-inset-bottom,0px)] bg-surface/95 backdrop-blur-[20px] backdrop-saturate-[180%] border-t border-border shadow-lg items-center justify-around print:hidden"
      role="tablist"
      aria-label="Schnellnavigation"
    >
      {/* Sliding indicator */}
      {activeIndex >= 0 && (
        <span
          className="absolute top-0 left-0 h-0.5 bg-primary rounded-b-sm pointer-events-none shadow-[0_0_8px_var(--color-primary)] motion-reduce:transition-none [transform:translateX(var(--tf))] w-[var(--tw)]"
          style={{
            '--tf': `${activeIndex * 100}%`,
            '--tw': `${100 / BOTTOM_TABS.length}%`,
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          } as CSSProperties}
          aria-hidden="true"
        />
      )}

      {BOTTOM_TABS.map((tab) => {
        const active = isActive(tab);
        const isChat = tab.id === 'chat';
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1.5 bg-none border-none text-text-secondary cursor-pointer relative min-h-[48px] min-w-[48px] [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 focus-visible:rounded-sm motion-reduce:[&_*]:!transition-none motion-reduce:[&_*]:!animate-none transition-transform duration-75 active:scale-[0.92] motion-reduce:active:scale-100',
              active && 'text-primary',
              isChat && 'flex-none',
            )}
            onClick={() => handleClick(tab)}
            aria-selected={active}
            aria-label={tab.label}
          >
            <span
              className={cn(
                'flex items-center justify-center leading-none transition-transform duration-[250ms] ease-spring',
                active && 'scale-110',
                isChat && 'size-11 bg-gradient-to-br from-primary to-primary-hover rounded-full text-white -mt-4 shadow-md',
              )}
              aria-hidden="true"
            >
              <TabIcon id={tab.id} active={active} />
            </span>
            <span className={cn(
              'text-[0.6rem] font-semibold tracking-[0.02em] whitespace-nowrap opacity-80 translate-y-0.5 transition-[opacity,transform] duration-200 min-[390px]:text-[0.65rem]',
              active && 'opacity-100 translate-y-0 font-bold',
              isChat && 'text-text-secondary mt-0.5',
            )}>
              {tab.label}
            </span>
            {tab.id === 'more' && emailUnreadCount > 0 && (
              <span
                className="absolute top-1 right-[calc(50%-18px)] min-w-4 h-4 px-1 text-[0.6rem] font-bold leading-4 text-center text-white bg-danger rounded-sm shadow-sm pointer-events-none animate-badge-pop"
                aria-label={`${emailUnreadCount} ungelesene Nachrichten`}
              >
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
