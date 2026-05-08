/**
 * ChatInput Component
 *
 * The input area including image upload, voice input, voice chat toggle,
 * textarea, send button, thinking mode bar, and inline error display.
 */

import { useState, useCallback, useEffect, useMemo, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { ImageUpload } from '../ImageUpload';
import { VoiceInput } from '../VoiceInput';
import { AnimatedButton } from '../ui';
import { SlashCommandMenu } from './SlashCommandMenu';

// Module-level constant — stable reference for useMemo
const ALL_THINKING_MODES = [
  { mode: 'assist' as const, icon: '\u{1F4A1}', label: 'Hilf mir' },
  { mode: 'challenge' as const, icon: '\u{1F525}', label: 'Fordere mich heraus' },
  { mode: 'coach' as const, icon: '\u{1F3AF}', label: 'Coache mich' },
  { mode: 'synthesize' as const, icon: '\u{1F517}', label: 'Verbinde Ideen' },
] as const;

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
  onPanelAction?: (panel: string, filter?: string) => void;
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
  voiceChatOpen: _voiceChatOpen, // eslint-disable-line @typescript-eslint/no-unused-vars -- destructured from props to avoid passing to DOM
  setVoiceChatOpen,
  inputRef,
  context,
  assistantMode,
  onPanelAction,
}: ChatInputProps) {
  // Slash-command detection
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const slashQuery = useMemo(() => {
    if (!inputValue.startsWith('/')) return '';
    const firstSpace = inputValue.indexOf(' ');
    return firstSpace === -1 ? inputValue.slice(1) : '';
  }, [inputValue]);

  useEffect(() => {
    setSlashMenuVisible(inputValue.startsWith('/') && !inputValue.includes(' '));
  }, [inputValue]);

  const handleSlashSelect = useCallback((cmd: { action: string; command: string }) => {
    setSlashMenuVisible(false);
    setInputValue('');
    onPanelAction?.(cmd.action);
  }, [onPanelAction, setInputValue]);

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

  // Context-aware mode filtering: show all for learning, hide challenge for creative
  const contextModes = useMemo(() => {
    if (context === 'people') return ALL_THINKING_MODES;
    if (context === 'strategy') return ALL_THINKING_MODES.filter(m => m.mode !== 'challenge');
    return ALL_THINKING_MODES;
  }, [context]);

  return (
    <>
      {/* Thinking Mode Toggle (Phase 32C-1) - hidden in assistantMode where it has no effect */}
      {!assistantMode && <div className="flex gap-1.5 px-1 pb-2">
        {contextModes.map(({ mode, icon, label }) => (
          <button
            key={mode}
            type="button"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border transition-all duration-150 cursor-pointer font-[inherit] ${
              thinkingMode === mode
                ? 'bg-primary/10 border-primary/20 text-primary font-medium'
                : 'border-glass-border text-text-secondary hover:bg-surface-hover hover:text-text hover:border-glass-border'
            }`}
            onClick={() => setThinkingMode(mode)}
            title={label}
            aria-label={label}
            aria-pressed={thinkingMode === mode}
          >
            <span className="text-sm leading-none">{icon}</span>
            <span className="leading-none">{label}</span>
          </button>
        ))}
      </div>}

      {/* Inline Error Display (for assistant mode where toast is hidden) */}
      {inlineError && (
        <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 rounded-lg text-sm" role="alert">
          <span className="text-[var(--color-danger)] flex-shrink-0" aria-hidden="true">{'\u2715'}</span>
          <span className="flex-1 text-[var(--color-danger)]">{inlineError}</span>
          <button
            type="button"
            className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            onClick={() => setInlineError(null)}
            aria-label="Fehlermeldung schließen"
          >
            {'\u00D7'}
          </button>
        </div>
      )}

      {/* Slash Command Menu */}
      <SlashCommandMenu
        query={slashQuery}
        onSelect={handleSlashSelect}
        onClose={() => setSlashMenuVisible(false)}
        visible={slashMenuVisible}
      />

      {/* Input Area */}
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2 max-md:gap-1.5 relative">
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
            className="flex items-center justify-center w-10 h-10 rounded-xl text-text-muted hover:text-text hover:bg-surface-hover transition-colors max-md:hidden"
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
            className="flex-1 min-w-0 min-h-[40px] max-h-[120px] resize-none bg-surface/80 backdrop-blur-md border border-glass-border rounded-xl px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/30 transition-all max-md:px-3"
            aria-label="Chat-Nachricht eingeben"
            enterKeyHint="send"
          />
          <AnimatedButton
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
            onClick={handleSendMessage}
            disabled={sending || (!inputValue.trim() && selectedImages.length === 0)}
            aria-label={sending ? 'Nachricht wird gesendet' : 'Nachricht senden'}
          >
            {sending ? (
              <span className="animate-pulse text-sm">...</span>
            ) : (
              <span className="text-base font-bold">{'\u2191'}</span>
            )}
          </AnimatedButton>
        </div>
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[11px] text-text-muted" title="Enter sendet die Nachricht, Shift+Enter für neue Zeile">
            Enter zum Senden {'\u00B7'} Shift+Enter f&uuml;r neue Zeile
          </span>
          {sessionId && (
            <button
              type="button"
              className="text-[11px] px-2 py-0.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
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
