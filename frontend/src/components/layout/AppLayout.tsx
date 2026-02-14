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

  // Sidebar collapsed state - persisted to localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return safeLocalStorage('get', 'sidebar-collapsed') === 'true';
  });

  // Mobile sidebar drawer state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Mobile chat overlay state
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

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
    <div className="app-layout" data-context={context}>
      {/* Skip to main content link (accessibility) */}
      <a href="#main-content" className="skip-link">
        Zum Hauptinhalt springen
      </a>

      {/* Desktop Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        currentPage={currentPage}
        onNavigate={onNavigate}
        apiStatus={apiStatus}
        isAIActive={isAIActive}
        aiActivityMessage={aiActivityMessage}
        archivedCount={archivedCount}
        notificationCount={notificationCount}
        favoritePages={favoritePages}
        toggleFavorite={toggleFavorite}
        isFavorited={isFavorited}
      />

      {/* Main Content Area */}
      <div className={`layout-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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

        <div className="layout-breadcrumbs">
          <Breadcrumbs
            items={getBreadcrumbs(currentPage)}
            onNavigate={onNavigate}
          />
        </div>

        <main className="layout-content" id="main-content" role="main">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Bar */}
      <MobileBottomBar
        currentPage={currentPage}
        onNavigate={handleMobileNavigate}
        onOpenMore={handleOpenMobileSidebar}
      />

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
        isAIActive={isAIActive}
        favoritePages={favoritePages}
        toggleFavorite={toggleFavorite}
      />

      {/* Floating AI Assistant */}
      <FloatingAssistant
        context={context}
        currentPage={currentPage}
        onNavigate={handleMobileNavigate}
      />

      {/* Mobile Chat Overlay */}
      {mobileChatOpen && renderChat && (
        <div className="mobile-chat-overlay" ref={chatOverlayRef}>
          <div className="mobile-chat-backdrop" onClick={handleCloseChat} aria-hidden="true" />
          <div className="mobile-chat-sheet">
            <div className="mobile-chat-header">
              <h2 className="mobile-chat-title">Chat</h2>
              <button
                type="button"
                className="mobile-chat-close neuro-focus-ring"
                onClick={handleCloseChat}
                aria-label="Chat schließen"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mobile-chat-content">
              {renderChat()}
            </div>
          </div>
        </div>
      )}

      {/* Feature Discovery Hints */}
      {activeHint && (
        <FeatureHintCard hint={activeHint} onDismiss={dismissHint} />
      )}
    </div>
  );
}

export default AppLayout;
