/**
 * ChatPage - Vollbild-Chat mit KI
 *
 * Wrapper um GeneralChat als eigene Seite (statt nur Overlay).
 * Der AI-Chat ist das Herzstueck von ZenAI.
 */

import { memo, Suspense, lazy } from 'react';
import type { AIContext } from './ContextSwitcher';
import { SkeletonLoader } from './SkeletonLoader';

const GeneralChat = lazy(() => import('./GeneralChat').then(m => ({ default: m.GeneralChat })));

interface ChatPageProps {
  context: AIContext;
}

const ChatPageComponent: React.FC<ChatPageProps> = ({ context }) => {
  return (
    <div className="chat-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Suspense fallback={<SkeletonLoader type="card" count={3} />}>
        <GeneralChat context={context} isCompact={false} />
      </Suspense>
    </div>
  );
};

export const ChatPage = memo(ChatPageComponent);
export default ChatPage;
