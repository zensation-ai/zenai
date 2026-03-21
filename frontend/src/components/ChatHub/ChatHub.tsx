/**
 * ChatHub — Primary entry point for ZenAI (Phase 104)
 *
 * Layout:
 * - GeneralChat (flex:1) — conversation stream with built-in input
 * - SlidePanel — future contextual panels (Phase 105)
 *
 * Note: SmartSurface is rendered by AppLayout (above ChatHub).
 * IntentBar + SuggestionChips are deferred to Phase 105 when the
 * bridge between IntentBar and GeneralChat is wired.
 */

import { useState, lazy, Suspense } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { SlidePanel } from './SlidePanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { SkeletonLoader } from '../SkeletonLoader';
import './ChatHub.css';

// Lazy-load GeneralChat (heavyweight, pulls in chat infra ~150KB)
const GeneralChat = lazy(() =>
  import('../GeneralChat').then(m => ({ default: m.GeneralChat }))
);

interface ChatHubProps {
  context: AIContext;
}

const ChatLoader = () => (
  <div className="chat-hub__loader" role="status" aria-live="polite" aria-label="Chat wird geladen">
    <SkeletonLoader type="card" count={2} />
  </div>
);

export function ChatHub({ context }: ChatHubProps) {
  const [slidePanelOpen, setSlidePanelOpen] = useState(false);

  return (
    <main className="chat-hub" role="main" aria-label="Chat Hub">
      {/* Conversation stream — GeneralChat includes its own input */}
      <div className="chat-hub__conversation">
        <ErrorBoundary>
          <Suspense fallback={<ChatLoader />}>
            <GeneralChat
              context={context}
              fullPage={true}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* SlidePanel — wired up, not open by default */}
      <SlidePanel
        open={slidePanelOpen}
        onClose={() => setSlidePanelOpen(false)}
        title="Details"
      >
        <p>Panel content will be populated in Phase 105.</p>
      </SlidePanel>
    </main>
  );
}

export default ChatHub;
