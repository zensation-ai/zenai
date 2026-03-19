/**
 * ChatHub — Primary entry point for ZenAI (Phase 104)
 *
 * 3-layer layout:
 * 1. SmartSurfaceV2 (top) — proactive, time-aware suggestion cards
 * 2. GeneralChat (middle, flex:1) — conversation stream
 * 3. IntentBar + SuggestionChips (bottom) — universal input
 *
 * SlidePanel is wired up for future contextual panels.
 * GeneralChat is lazily loaded behind ErrorBoundary + Suspense.
 */

import { useState, useCallback, useRef, lazy, Suspense } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { SmartSurfaceV2 } from './SmartSurfaceV2';
import { IntentBar, type ThinkingDepth } from './IntentBar';
import { SuggestionChips } from './SuggestionChips';
import { SlidePanel } from './SlidePanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { SkeletonLoader } from '../SkeletonLoader';
import type { SuggestionChip } from './types';
import './ChatHub.css';

// Lazy-load GeneralChat (heavyweight, pulls in chat infra ~150KB)
const GeneralChat = lazy(() =>
  import('../GeneralChat').then(m => ({ default: m.GeneralChat }))
);

interface ChatHubProps {
  context: AIContext;
}

const SUGGESTION_CHIPS: SuggestionChip[] = [
  { id: 'c1', label: 'Idee aufschreiben', prompt: 'Hilf mir, eine Idee zu strukturieren.' },
  { id: 'c2', label: 'Plan erstellen', prompt: 'Erstelle mir einen Plan fuer heute.' },
  { id: 'c3', label: 'Erklaer mir...', prompt: 'Erklaer mir ein Konzept, das ich verstehen moechte.' },
  { id: 'c4', label: 'Code schreiben', prompt: 'Hilf mir, Code zu schreiben.' },
];

const ChatLoader = () => (
  <div className="chat-hub__loader" role="status" aria-live="polite" aria-label="Chat wird geladen">
    <SkeletonLoader type="card" count={2} />
  </div>
);

export function ChatHub({ context }: ChatHubProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<ThinkingDepth>('thorough');
  const [slidePanelOpen, setSlidePanelOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // External send trigger: when user clicks send in IntentBar
  // GeneralChat owns its own input; IntentBar is a parallel overlay.
  // In Phase 104 we wire them via a shared ref / callback bridge.
  const pendingSendRef = useRef<string | null>(null);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    // Store pending message; GeneralChat will pick it up via initialPrompt flow
    // (full bridge is wired in Phase 105 — for now just clear)
    pendingSendRef.current = inputValue;
    setSending(true);
    setInputValue('');
    // Reset sending flag after a tick (GeneralChat takes over)
    setTimeout(() => setSending(false), 100);
  }, [inputValue]);

  const handleChipSelect = useCallback((prompt: string) => {
    setInputValue(prompt);
    textareaRef.current?.focus();
  }, []);

  const showChips = inputFocused && inputValue.trim().length === 0;

  return (
    <main className="chat-hub" role="main" aria-label="Chat Hub">
      {/* Layer 1: Proactive suggestion cards */}
      <SmartSurfaceV2 context={context} />

      {/* Layer 2: Conversation stream */}
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

      {/* Layer 3: Universal input area */}
      <div className="chat-hub__input-area">
        <SuggestionChips
          chips={SUGGESTION_CHIPS}
          visible={showChips}
          onSelect={handleChipSelect}
        />
        <IntentBar
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onFocusChange={setInputFocused}
          sending={sending}
          thinkingMode={thinkingMode}
          onThinkingModeChange={setThinkingMode}
          context={context}
          textareaRef={textareaRef}
        />
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
