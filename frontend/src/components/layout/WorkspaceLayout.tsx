/**
 * WorkspaceLayout — Full Workspace Mode Layout
 *
 * Combines TopBar + Breadcrumbs + WorkspaceSidebar + WorkspaceRouter + ChatDrawer.
 *
 * ┌──────────────────────────────────────────────┐
 * │ TopBar (full width)                           │
 * ├────────┬─────────────────┬───────────────────┤
 * │Sidebar │ Breadcrumbs      │ ChatDrawer        │
 * │        │ Main Content     │ (if open)         │
 * │        │ (WorkspaceRouter)│                   │
 * └────────┴─────────────────┴───────────────────┘
 */

import { useMemo } from 'react';
import { TopBar } from './TopBar';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { ChatDrawer } from './ChatDrawer';
import { WorkspaceRouter } from './WorkspaceRouter';
import { MobileBottomBar } from './MobileBottomBar';
import { GeneralChat } from '../GeneralChat/GeneralChat';
import { Breadcrumbs } from '../Breadcrumbs';
import { buildBreadcrumbs } from '../../utils/buildBreadcrumbs';
import { GettingStartedChecklist } from '../onboarding/GettingStartedChecklist';
import { FeedbackButton } from './FeedbackButton';
import { InlineAssistant } from '../InlineAssistant/InlineAssistant';
import type { Page } from '../../types';
import type { AIContext } from '../ContextSwitcher';
interface WorkspaceLayoutProps {
  currentPage: Page;
  tabParam?: string;
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  onNavigate: (page: Page) => void;
  onSearchOpen?: () => void;
  activeSessionId?: string;
  onSessionChange?: (id: string | null) => void;
}

export function WorkspaceLayout({
  currentPage,
  tabParam,
  context,
  onContextChange,
  onNavigate,
  onSearchOpen,
  activeSessionId,
  onSessionChange,
}: WorkspaceLayoutProps) {
  const breadcrumbItems = useMemo(
    () => buildBreadcrumbs(currentPage, tabParam),
    [currentPage, tabParam],
  );

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg">
      <a href="#main-content" className="skip-to-content">
        Zum Hauptinhalt springen
      </a>
      <TopBar
        context={context}
        onContextChange={onContextChange}
        onSearchOpen={onSearchOpen}
        onNavigateHome={() => onNavigate('hub')}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <WorkspaceSidebar
          currentPage={currentPage}
          onNavigate={onNavigate}
        />

        <main className="flex-1 flex flex-col overflow-y-auto min-w-0 max-md:pb-[72px]" id="main-content">
          {/* Breadcrumbs - hidden on chat/hub pages */}
          {currentPage !== 'hub' && currentPage !== 'chat' && currentPage !== 'home' && (
            <div className="px-6 pt-4 max-md:px-4 max-md:pt-3">
              <Breadcrumbs items={breadcrumbItems} onNavigate={onNavigate} />
            </div>
          )}
          {/* Content area */}
          {currentPage === 'hub' || currentPage === 'home' ? (
            <div className="flex-1 min-h-0">
              <WorkspaceRouter
                currentPage={currentPage}
                context={context}
                initialTab={tabParam}
                onNavigate={onNavigate}
              />
            </div>
          ) : currentPage === 'chat' ? (
            <div className="px-4 pb-4 pt-2 max-md:px-2 max-md:pb-2 max-md:pt-1 flex-1 min-h-0">
              <WorkspaceRouter
                currentPage={currentPage}
                context={context}
                initialTab={tabParam}
                onNavigate={onNavigate}
              />
            </div>
          ) : (
            <div className="px-6 pb-6 max-md:px-4 max-md:pb-4 flex-1 min-h-0 animate-page-enter">
              <WorkspaceRouter
                currentPage={currentPage}
                context={context}
                initialTab={tabParam}
                onNavigate={onNavigate}
              />
            </div>
          )}
        </main>

        <ChatDrawer>
          <GeneralChat
            context={context}
            isCompact
            initialSessionId={activeSessionId}
            onSessionChange={onSessionChange ?? undefined}
          />
        </ChatDrawer>
      </div>

      <MobileBottomBar
        currentPage={currentPage}
        onNavigate={onNavigate}
        onOpenSearch={onSearchOpen}
      />

      <GettingStartedChecklist onNavigate={onNavigate} />
      <FeedbackButton />
      <InlineAssistant context={context} />
    </div>
  );
}

export default WorkspaceLayout;
