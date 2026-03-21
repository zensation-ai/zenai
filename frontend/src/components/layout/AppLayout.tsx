/**
 * AppLayout - Layout Shell
 *
 * Provides the sidebar + topbar + main content area structure.
 * Manages sidebar collapsed/expanded state and mobile drawer.
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Page, ApiStatus } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { Breadcrumbs, getBreadcrumbs } from '../Breadcrumbs';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileBottomBar } from './MobileBottomBar';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { safeLocalStorage } from '../../utils/storage';
import { FloatingAssistant } from '../FloatingAssistant/FloatingAssistant';
import { useFeatureHint } from '../../hooks/useFeatureHint';
import { FeatureHintCard } from '../FeatureHintCard';
import { ProactivePanel, ProactiveBellButton } from '../ProactivePanel';
import { SmartSurface } from '../SmartSurface/SmartSurface';
import { ContextIndicator } from './ContextIndicator';
import { OfflineIndicator } from '../OfflineIndicator';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { UnifiedAssistant } from '../UnifiedAssistant/UnifiedAssistant';
import { FocusMode } from '../FocusMode';
import { CognitiveLoadIndicator } from './CognitiveLoadIndicator';
import { ErrorBoundary } from '../ErrorBoundary';
import './AppLayout.css';

interface AppLayoutProps {
  children: ReactNode;
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  apiStatus: ApiStatus | null;
  isAIActive: boolean;
  aiActivityMessage?: string;
  archivedCount: number;
  notificationCount: number;
  emailUnreadCount?: number;
  onOpenSearch: () => void;
  onRefresh: () => void;
  favoritePages?: Page[];
  toggleFavorite?: (page: Page) => void;
  isFavorited?: (page: Page) => boolean;
  /** Render prop for chat overlay (mobile bottom bar) */
  renderChat?: () => ReactNode;
}

export function AppLayout({
  children,
  context,
  onContextChange,
  currentPage,
  onNavigate,
  apiStatus,
  isAIActive,
  aiActivityMessage,
  archivedCount,
  notificationCount,
  emailUnreadCount,
  onOpenSearch,
  onRefresh,
  favoritePages,
  toggleFavorite,
  isFavorited,
  renderChat,
}: AppLayoutProps) {
  // Feature discovery hints
  const location = useLocation();
  const { activeHint, dismissHint } = useFeatureHint(location.pathname);

  // Vim-style G+key navigation
  const { isSequenceActive, sequenceHint } = useKeyboardNavigation({
    onNavigate,
    enabled: true,
  });

  // Responsive breakpoints
  const { isMobile, isTablet } = useBreakpoint();

  // Sidebar collapsed state - persisted to localStorage, auto-collapse on tablet
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return safeLocalStorage('get', 'sidebar-collapsed') === 'true';
  });

  // Auto-collapse sidebar on tablet, auto-expand on desktop
  useEffect(() => {
    if (isTablet && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
  // Intentionally omit sidebarCollapsed — only auto-collapse when breakpoint changes, not on manual toggle
  }, [isTablet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile sidebar drawer state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Mobile chat overlay state
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Proactive panel state
  const [proactivePanelOpen, setProactivePanelOpen] = useState(false);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      safeLocalStorage('set', 'sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  const handleOpenMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);

  const handleCloseMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const handleMobileNavigate = useCallback((page: Page) => {
    onNavigate(page);
    setMobileSidebarOpen(false);
    setMobileChatOpen(false);
  }, [onNavigate]);

  const handleCloseChat = useCallback(() => {
    setMobileChatOpen(false);
  }, []);

  const chatOverlayRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const prevPageRef = useRef<Page>(currentPage);

  // Scroll to top only on page navigation, not on tab changes within same page
  useEffect(() => {
    // Extract the base page (before any sub-route like /ideas/incubator)
    const basePage = (page: Page): string => {
      const s = String(page);
      return s.split('/')[0] || s;
    };
    const prevBase = basePage(prevPageRef.current);
    const currBase = basePage(currentPage);
    prevPageRef.current = currentPage;

    // Only scroll when navigating to a different page, not a different tab
    if (prevBase !== currBase) {
      mainContentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [currentPage]);

  // Escape key + body scroll lock for chat overlay
  useEffect(() => {
    if (!mobileChatOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseChat();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [mobileChatOpen, handleCloseChat]);

  // Focus trap for chat overlay
  useEffect(() => {
    if (!mobileChatOpen || !chatOverlayRef.current) return;

    const focusable = chatOverlayRef.current.querySelectorAll(
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
  }, [mobileChatOpen]);

  return (
    <div className={`flex h-dvh relative max-w-full overflow-hidden ${isMobile ? 'is-mobile' : ''} ${isTablet ? 'is-tablet' : ''}`} data-context={context}>
      {/* Skip to main content link (accessibility) */}
      <a href="#main-content" className="skip-link">
        Zum Hauptinhalt springen
      </a>

      {/* Desktop/Tablet Sidebar — hidden on mobile */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed || isTablet}
          onToggleCollapse={handleToggleSidebar}
          currentPage={currentPage}
          onNavigate={onNavigate}
          apiStatus={apiStatus}
          isAIActive={isAIActive}
          aiActivityMessage={aiActivityMessage}
          archivedCount={archivedCount}
          notificationCount={notificationCount}
          emailUnreadCount={emailUnreadCount}
          favoritePages={favoritePages}
          toggleFavorite={toggleFavorite}
          isFavorited={isFavorited}
        />
      )}

      {/* Main Content Area */}
      <div
        className={`flex flex-1 flex-col min-w-0 min-h-0 max-w-[100vw] overflow-hidden transition-[margin-left] duration-300 ease-smooth
          ${isMobile ? 'no-sidebar' : ''}
          print:ml-0 print:pb-0`}
        style={{
          marginLeft: isMobile ? 0 : (sidebarCollapsed || isTablet ? 'var(--sidebar-collapsed-width, 64px)' : 'var(--sidebar-width, 260px)'),
          paddingBottom: isMobile ? 'var(--spacing-bottombar, 64px)' : undefined,
        }}
      >
        <div className="relative flex items-stretch">
          <TopBar
            currentPage={currentPage}
            context={context}
            onContextChange={onContextChange}
            apiStatus={apiStatus}
            onOpenSearch={onOpenSearch}
            onOpenMobileSidebar={handleOpenMobileSidebar}
            onRefresh={onRefresh}
            isFavorited={isFavorited?.(currentPage)}
            onToggleFavorite={toggleFavorite ? () => toggleFavorite(currentPage) : undefined}
          />
          <div className="flex items-center gap-2 pr-3 shrink-0 border-b border-white/[0.06]">
            <ErrorBoundary fallback={null}><CognitiveLoadIndicator context={context} /></ErrorBoundary>
            <FocusMode context={context} />
            <ErrorBoundary fallback={null}><ContextIndicator context={context} /></ErrorBoundary>
            <ProactiveBellButton context={context} onClick={() => setProactivePanelOpen(prev => !prev)} />
          </div>
        </div>

        {proactivePanelOpen && (
          <ProactivePanel
            context={context}
            isOpen={proactivePanelOpen}
            onClose={() => setProactivePanelOpen(false)}
          />
        )}

        <OfflineIndicator />

        <ErrorBoundary fallback={null}><SmartSurface context={context} /></ErrorBoundary>

        <div className="shrink-0 max-md:hidden">
          <Breadcrumbs
            items={getBreadcrumbs(currentPage)}
            onNavigate={onNavigate}
          />
        </div>

        <main
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative scroll-smooth overscroll-y-contain motion-reduce:scroll-auto"
          id="main-content"
          role="main"
          tabIndex={-1}
          ref={mainContentRef}
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Bar — only on mobile */}
      {isMobile && (
        <MobileBottomBar
          currentPage={currentPage}
          onNavigate={handleMobileNavigate}
          onOpenMore={handleOpenMobileSidebar}
          emailUnreadCount={emailUnreadCount}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <MobileSidebarDrawer
        isOpen={mobileSidebarOpen}
        onClose={handleCloseMobileSidebar}
        currentPage={currentPage}
        onNavigate={handleMobileNavigate}
        context={context}
        onContextChange={onContextChange}
        archivedCount={archivedCount}
        notificationCount={notificationCount}
        emailUnreadCount={emailUnreadCount}
        isAIActive={isAIActive}
        favoritePages={favoritePages}
        toggleFavorite={toggleFavorite}
      />

      {/* Unified AI Assistant Overlay (Cmd+Shift+Space) */}
      <UnifiedAssistant context={context} currentPage={currentPage} onNavigate={onNavigate} onOpenSearch={onOpenSearch} />

      {/* Floating AI Assistant */}
      <FloatingAssistant
        context={context}
        currentPage={currentPage}
        onNavigate={handleMobileNavigate}
        onContextChange={onContextChange}
      />

      {/* Mobile Chat Overlay */}
      {mobileChatOpen && renderChat && (
        <div className="hidden max-md:block fixed inset-0 z-dropdown" ref={chatOverlayRef}>
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[4px] animate-fade-in"
            onClick={handleCloseChat}
            aria-hidden="true"
          />
          <div className="absolute bottom-0 left-0 right-0 top-[10vh] pb-[env(safe-area-inset-bottom,0px)] bg-surface-solid rounded-t-xl flex flex-col animate-slide-in-bottom shadow-xl dark:bg-surface-dark-solid">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(20,50,70,0.08)] shrink-0">
              <h2 className="text-base font-semibold text-txt m-0">Chat</h2>
              <button
                type="button"
                className="w-touch h-touch flex items-center justify-center bg-[rgba(20,60,80,0.08)] border-none rounded-sm text-txt-secondary cursor-pointer transition-all duration-150 hover:bg-surface-hover focus-ring"
                onClick={handleCloseChat}
                aria-label="Chat schließen"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-0">
              {renderChat()}
            </div>
          </div>
        </div>
      )}

      {/* Feature Discovery Hints */}
      {activeHint && (
        <FeatureHintCard hint={activeHint} onDismiss={dismissHint} />
      )}

      {/* G+key sequence hint overlay */}
      {isSequenceActive && sequenceHint && (
        <div className="g-key-hint-overlay" aria-live="polite">
          <div className="g-key-hint-pill">
            <kbd>G</kbd>
            <span>+ Taste druecken...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppLayout;
