/**
 * AppLayout - Layout Shell
 *
 * Provides the sidebar + topbar + main content area structure.
 * Manages sidebar collapsed/expanded state and mobile drawer.
 */

import { useState, useCallback, type ReactNode } from 'react';
import type { Page, ApiStatus } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileBottomBar } from './MobileBottomBar';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { safeLocalStorage } from '../../utils/storage';
import './AppLayout.css';

interface AppLayoutProps {
  children: ReactNode;
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  apiStatus: ApiStatus | null;
  isAIActive: boolean;
  archivedCount: number;
  onOpenSearch: () => void;
  onRefresh: () => void;
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
  archivedCount,
  onOpenSearch,
  onRefresh,
  renderChat,
}: AppLayoutProps) {
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

  const handleOpenChat = useCallback(() => {
    setMobileChatOpen(true);
  }, []);

  const handleCloseChat = useCallback(() => {
    setMobileChatOpen(false);
  }, []);

  return (
    <div className="app-layout" data-context={context}>
      {/* Desktop Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        currentPage={currentPage}
        onNavigate={onNavigate}
        apiStatus={apiStatus}
        isAIActive={isAIActive}
        archivedCount={archivedCount}
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
        />

        <main className="layout-content" id="main-content" role="main">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Bar */}
      <MobileBottomBar
        currentPage={currentPage}
        onNavigate={handleMobileNavigate}
        onOpenChat={handleOpenChat}
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
        isAIActive={isAIActive}
      />

      {/* Mobile Chat Overlay */}
      {mobileChatOpen && renderChat && (
        <div className="mobile-chat-overlay">
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
    </div>
  );
}

export default AppLayout;
