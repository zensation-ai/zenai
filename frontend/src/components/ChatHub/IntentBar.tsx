/**
 * IntentBar — Universal input for the Chat Hub (Phase 104)
 *
 * Evolution of ChatInput. Same backend API, new presentation layer.
 * Features: text input, voice button, file drop zone, thinking mode toggle.
 * Suggestion chips are rendered externally via SuggestionChips component.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { Send, Mic, Paperclip } from 'lucide-react';
import './IntentBar.css';

export type ThinkingDepth = 'fast' | 'thorough' | 'deep';

interface IntentBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onFocusChange: (focused: boolean) => void;
  sending: boolean;
  thinkingMode: ThinkingDepth | 'assist' | 'challenge' | 'coach' | 'synthesize';
  onThinkingModeChange: (mode: ThinkingDepth) => void;
  context: AIContext;
  onVoiceClick?: () => void;
  onFileClick?: () => void;
  /** Reference to the textarea for external focus control */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

const THINKING_MODES = [
  { value: 'fast' as const, label: 'Schnell', ariaLabel: 'Schnell' },
  { value: 'thorough' as const, label: 'Gruendlich', ariaLabel: 'Gruendlich' },
  { value: 'deep' as const, label: 'Tief', ariaLabel: 'Tief' },
] as const;

/** Map old thinking modes to new depth scale */
function resolveDepth(mode: string): ThinkingDepth {
  if (mode === 'fast' || mode === 'assist') return 'fast';
  if (mode === 'thorough' || mode === 'challenge' || mode === 'coach') return 'thorough';
  if (mode === 'deep' || mode === 'synthesize') return 'deep';
  return 'thorough';
}

export function IntentBar({
  value,
  onChange,
  onSend,
  onFocusChange,
  sending,
  thinkingMode,
  onThinkingModeChange,
  context: _context,
  onVoiceClick,
  onFileClick,
  textareaRef: externalRef,
}: IntentBarProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  const currentDepth = resolveDepth(thinkingMode);
  const canSend = value.trim().length > 0 && !sending;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, textareaRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSend) onSend();
      }
    },
    [canSend, onSend]
  );

  return (
    <div className="intent-bar">
      <div className="intent-bar__input-row">
        {/* Voice button */}
        <button
          className="intent-bar__icon-btn"
          onClick={onVoiceClick}
          aria-label="Spracheingabe"
          type="button"
        >
          <Mic size={18} />
        </button>

        {/* File attach button */}
        <button
          className="intent-bar__icon-btn"
          onClick={onFileClick}
          aria-label="Datei anhaengen"
          type="button"
        >
          <Paperclip size={18} />
        </button>

        {/* Main textarea */}
        <textarea
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
          className="intent-bar__textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="Frag mich etwas oder gib mir eine Aufgabe..."
          rows={1}
          aria-label="Nachricht eingeben"
        />

        {/* Send button */}
        <button
          className="intent-bar__send-btn"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Nachricht senden"
          type="button"
        >
          <Send size={18} />
        </button>
      </div>

      {/* Thinking depth toggle */}
      <div className="intent-bar__toolbar" role="radiogroup" aria-label="Denkgeschwindigkeit">
        {THINKING_MODES.map(({ value: mode, label, ariaLabel }) => (
          <button
            key={mode}
            role="radio"
            aria-checked={currentDepth === mode}
            aria-label={ariaLabel}
            className={`intent-bar__depth-btn ${currentDepth === mode ? 'intent-bar__depth-btn--active' : ''}`}
            onClick={() => onThinkingModeChange(mode)}
            type="button"
          >
            <span className="intent-bar__depth-dot" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
