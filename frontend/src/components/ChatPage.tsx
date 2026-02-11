/**
 * ChatPage - Vollbild-Chat mit KI
 *
 * Layout: Session-Sidebar (links) + GeneralChat (rechts).
 * Der AI-Chat ist das Herzstueck von ZenAI.
 */

import { memo, Suspense, lazy, useState, useCallback } from 'react';
import type { AIContext } from './ContextSwitcher';
import { ChatSessionSidebar } from './ChatSessionSidebar';
import { SkeletonLoader } from './SkeletonLoader';
import { safeLocalStorage } from '../utils/storage';

const GeneralChat = lazy(() => import('./GeneralChat').then(m => ({ default: m.GeneralChat })));

interface ChatPageProps {
  context: AIContext;
}

const SIDEBAR_KEY = 'zenai-chat-sidebar-collapsed';

const ChatPageComponent: React.FC<ChatPageProps> = ({ context }) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
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
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
  }, []);

  const handleSessionChange = useCallback((sessionId: string | null) => {
    setActiveSessionId(sessionId);
  }, []);

  return (
    <div className="chat-page">
      <ChatSessionSidebar
        context={context}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />
      <div className="chat-page-main">
        <Suspense fallback={<SkeletonLoader type="card" count={3} />}>
          <GeneralChat
            context={context}
            isCompact={false}
            fullPage={true}
            initialSessionId={activeSessionId}
            onSessionChange={handleSessionChange}
          />
        </Suspense>
      </div>
    </div>
  );
};

export const ChatPage = memo(ChatPageComponent);
export default ChatPage;
