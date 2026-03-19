/**
 * ChatPage - Unified Chat mit Kontext-Steuerung
 *
 * NOTE (Phase 104): ChatHub is now the primary entry point at route "/".
 * ChatPage remains accessible at "/chat" for its additional features:
 * - Context switcher (4 tiles)
 * - Quick-Actions
 * - Session-Sidebar
 *
 * Zentrales Chat-Interface mit:
 * - Kontext-Leiste (4 Kacheln: Privat, Arbeit, Lernen, Kreativ)
 * - Quick-Actions (kontextabhaengige Schnellaktionen, klappbar)
 * - Session-Sidebar (links, toggle)
 * - GeneralChat (rechts, Vollbild)
 *
 * Der Kontext wird hier direkt im Chat gesteuert,
 * nicht ueber den globalen ContextSwitcher in der TopBar.
 */

import { memo, Suspense, lazy, useState, useCallback } from 'react';
import type { AIContext } from './ContextSwitcher';
import { ChatSessionSidebar } from './ChatSessionSidebar';
import { ChatContextBar } from './GeneralChat/ChatContextBar';
import { ChatQuickActions } from './GeneralChat/ChatQuickActions';
import { RisingBubbles } from './RisingBubbles';
import { SkeletonLoader } from './SkeletonLoader';
import { ErrorBoundary } from './ErrorBoundary';
import { safeLocalStorage } from '../utils/storage';
import './GeneralChat/ChatContextBar.css';
import './GeneralChat/ChatQuickActions.css';

const GeneralChat = lazy(() => import('./GeneralChat').then(m => ({ default: m.GeneralChat })));

interface ChatPageProps {
  context: AIContext;
  onContextChange?: (context: AIContext) => void;
}

const SIDEBAR_KEY = 'zenai-chat-sidebar-collapsed';
const QUICK_ACTION_EVENT = 'zenai-chat-quick-action';

const ChatPageComponent: React.FC<ChatPageProps> = ({ context, onContextChange }) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hasMessages, setHasMessages] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => safeLocalStorage('get', SIDEBAR_KEY) === 'true'
  );
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      safeLocalStorage('set', SIDEBAR_KEY, String(next));
      return next;
    });
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setHasMessages(true);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setHasMessages(false);
  }, []);

  const handleSessionChange = useCallback((sessionId: string | null) => {
    setActiveSessionId(sessionId);
    if (sessionId) setHasMessages(true);
  }, []);

  const handleContextChange = useCallback((newContext: AIContext) => {
    if (onContextChange) {
      onContextChange(newContext);
    }
    // Reset session when switching context
    setActiveSessionId(null);
    setHasMessages(false);
  }, [onContextChange]);

  const handleQuickAction = useCallback((prompt: string) => {
    // Dispatch event so GeneralChat can pick it up (same pattern as FloatingAssistant)
    window.dispatchEvent(
      new CustomEvent(QUICK_ACTION_EVENT, { detail: { prompt } })
    );
  }, []);

  return (
    <div className="chat-page">
      <RisingBubbles variant="subtle" />
      <ChatSessionSidebar
        context={context}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />
      <div className="chat-page-main">
        {/* Kontext-Leiste: immer sichtbar, ein Klick zum Wechseln */}
        <ChatContextBar
          context={context}
          onContextChange={handleContextChange}
        />

        {/* Quick-Actions: kontextabhaengig, klappbar */}
        <ChatQuickActions
          context={context}
          onAction={handleQuickAction}
          hasMessages={hasMessages}
        />

        {/* Chat-Bereich */}
        <div className="chat-page-chat">
          <ErrorBoundary>
            <Suspense fallback={<SkeletonLoader type="card" count={3} />}>
              <GeneralChat
                context={context}
                isCompact={false}
                fullPage={true}
                initialSessionId={activeSessionId}
                onSessionChange={handleSessionChange}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};

export const ChatPage = memo(ChatPageComponent);
export default ChatPage;
