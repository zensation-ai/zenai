/**
 * ChatInput Component
 *
 * The input area including image upload, voice input, voice chat toggle,
 * textarea, send button, thinking mode bar, and inline error display.
 */

import { useCallback, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { ImageUpload } from '../ImageUpload';
import { VoiceInput } from '../VoiceInput';

interface ChatInputProps {
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
  selectedImages: File[];
  setSelectedImages: Dispatch<SetStateAction<File[]>>;
  sending: boolean;
  handleSendMessage: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleNewChat: () => void;
  sessionId: string | null;
  inlineError: string | null;
  setInlineError: Dispatch<SetStateAction<string | null>>;
  thinkingMode: 'assist' | 'challenge' | 'coach' | 'synthesize';
  setThinkingMode: Dispatch<SetStateAction<'assist' | 'challenge' | 'coach' | 'synthesize'>>;
  voiceChatOpen: boolean;
  setVoiceChatOpen: Dispatch<SetStateAction<boolean>>;
  inputRef: RefObject<HTMLTextAreaElement>;
  context: AIContext;
  assistantMode: boolean;
}

export function ChatInput({
  inputValue,
  setInputValue,
  selectedImages,
  setSelectedImages,
  sending,
  handleSendMessage,
  handleKeyDown,
  handleNewChat,
  sessionId,
  inlineError,
  setInlineError,
  thinkingMode,
  setThinkingMode,
  voiceChatOpen: _voiceChatOpen, // eslint-disable-line @typescript-eslint/no-unused-vars
  setVoiceChatOpen,
  inputRef,
  context,
  assistantMode,
}: ChatInputProps) {
  // Auto-resize textarea to fit content (up to max-height set in CSS)
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto'; // Reset to measure scrollHeight
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [inputRef]);

  useEffect(() => {
    autoResize();
  }, [inputValue, autoResize]);

  return (
    <>
      {/* Thinking Mode Toggle (Phase 32C-1) - hidden in assistantMode where it has no effect */}
      {!assistantMode && <div className="thinking-mode-bar">
        {([
          { mode: 'assist' as const, icon: '\u{1F4A1}', label: 'Hilf mir' },
          { mode: 'challenge' as const, icon: '\u{1F525}', label: 'Fordere mich heraus' },
          { mode: 'coach' as const, icon: '\u{1F3AF}', label: 'Coache mich' },
          { mode: 'synthesize' as const, icon: '\u{1F517}', label: 'Verbinde Ideen' },
        ]).map(({ mode, icon, label }) => (
          <button
            key={mode}
            type="button"
            className={`thinking-mode-btn ${thinkingMode === mode ? 'active' : ''}`}
            onClick={() => setThinkingMode(mode)}
            title={label}
          >
            <span className="thinking-mode-icon">{icon}</span>
            <span className="thinking-mode-label">{label}</span>
          </button>
        ))}
      </div>}

      {/* Inline Error Display (for assistant mode where toast is hidden) */}
      {inlineError && (
        <div className="chat-inline-error" role="alert">
          <span className="chat-inline-error-icon" aria-hidden="true">{'\u2715'}</span>
          <span className="chat-inline-error-message">{inlineError}</span>
          <button
            type="button"
            className="chat-inline-error-dismiss"
            onClick={() => setInlineError(null)}
            aria-label="Fehlermeldung schlie\u00DFen"
          >
            {'\u00D7'}
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          {/* Image Upload Button */}
          <ImageUpload
            onImagesChange={setSelectedImages}
            images={selectedImages}
            disabled={sending}
            compact={true}
            maxImages={5}
          />
          {/* Voice Input Button */}
          <VoiceInput
            onTranscript={(text) => setInputValue((prev) => prev ? `${prev} ${text}` : text)}
            disabled={sending}
            context={context}
            compact={true}
          />
          <button
            type="button"
            className="voice-chat-toggle neuro-hover-lift neuro-focus-ring"
            onClick={() => setVoiceChatOpen(true)}
            disabled={sending}
            aria-label="Sprachkonversation starten"
            title="Sprachkonversation"
          >
            <span aria-hidden="true">{'\u{1F3A7}'}</span>
          </button>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedImages.length > 0 ? "Frage zum Bild..." : "Frag mich etwas..."}
            rows={1}
            disabled={sending}
            className="chat-input liquid-glass-input neuro-placeholder-animated"
            aria-label="Chat-Nachricht eingeben"
          />
          <button
            type="button"
            className="chat-send-btn neuro-hover-lift neuro-color-transition neuro-focus-ring"
            onClick={handleSendMessage}
            disabled={sending || (!inputValue.trim() && selectedImages.length === 0)}
            aria-label={sending ? 'Nachricht wird gesendet' : 'Nachricht senden'}
          >
            {sending ? (
              <span className="sending-dots">...</span>
            ) : (
              <span className="send-arrow">{'\u2191'}</span>
            )}
          </button>
        </div>
        <div className="chat-input-footer">
          <span className="chat-hint" title="Enter sendet die Nachricht, Shift+Enter f\u00FCr neue Zeile">
            Enter zum Senden {'\u00B7'} Shift+Enter f{'\u00FC'}r neue Zeile
          </span>
          {sessionId && (
            <button
              type="button"
              className="new-chat-btn neuro-hover-lift neuro-color-transition neuro-focus-ring"
              onClick={handleNewChat}
              aria-label="Neue Chat-Session starten (bisherige bleibt erhalten)"
            >
              + Neuer Chat
            </button>
          )}
        </div>
      </div>
    </>
  );
}
