import React, { useState, useRef, useCallback, memo, ReactNode } from 'react';
import { TEXT_PROCESSING_STEPS } from '../utils/aiSteps';
import { AI_PERSONALITY, AI_AVATAR } from '../utils/aiPersonality';
import { MAX_TEXT_INPUT_CHARS, CHAR_WARNING_THRESHOLD } from '../constants';
import '../neurodesign.css';
import './CommandCenter.css';

export type InputMode = 'voice' | 'chat';

interface CommandCenterProps {
  context: 'personal' | 'work';
  isAIActive: boolean;
  currentStepIndex: number | null;
  textValue: string;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  onModeChange: (mode: InputMode) => void;
  inputMode: InputMode;
  isProcessing: boolean;
  disabled?: boolean;
  /** Optional custom record button component */
  renderRecordButton?: () => ReactNode;
  /** Optional chat component to render in chat mode */
  renderChat?: () => ReactNode;
}

/**
 * CommandCenter - Central input component with AI status transparency
 *
 * Features:
 * - Large textarea for text input
 * - Voice recording button
 * - Chat mode toggle
 * - Real-time AI processing status display
 */
const CommandCenterComponent: React.FC<CommandCenterProps> = ({
  context,
  isAIActive,
  currentStepIndex,
  textValue,
  onTextChange,
  onSubmit,
  onModeChange,
  inputMode,
  isProcessing,
  disabled = false,
  renderRecordButton,
  renderChat,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length <= MAX_TEXT_INPUT_CHARS) {
        onTextChange(value);
      }
    },
    [onTextChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Cmd/Ctrl + Enter
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (textValue.trim() && !isProcessing) {
          onSubmit();
        }
      }
    },
    [onSubmit, textValue, isProcessing]
  );

  const handleSubmit = useCallback(() => {
    if (textValue.trim() && !isProcessing) {
      onSubmit();
    }
  }, [onSubmit, textValue, isProcessing]);

  const charsRemaining = MAX_TEXT_INPUT_CHARS - textValue.length;
  const showCharWarning = charsRemaining < CHAR_WARNING_THRESHOLD;
  const steps = TEXT_PROCESSING_STEPS;
  const showAIStatus = isAIActive && currentStepIndex !== null && currentStepIndex >= 0;

  return (
    <div
      className={`command-center liquid-glass-nav ${isFocused ? 'focused' : ''} ${
        isProcessing ? 'processing' : ''
      }`}
      data-context={context}
    >
      {/* Textarea only shown in voice mode */}
      {inputMode === 'voice' && (
        <div className="command-input-wrapper">
          <textarea
            ref={textareaRef}
            className="command-textarea"
            placeholder="Was beschäftigt dich? Teile deine Gedanken, Ideen oder Aufgaben..."
            value={textValue}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled || isProcessing}
            rows={4}
            aria-label="Gedanken eingeben"
          />

          <div className="command-input-footer">
            <span
              className={`command-char-count ${showCharWarning ? 'warning' : ''}`}
            >
              {charsRemaining.toLocaleString()} Zeichen
            </span>
            <span className="command-hint">⌘/Ctrl + Enter zum Senden</span>
          </div>
        </div>
      )}

      {/* Voice mode: show actions */}
      {inputMode === 'voice' && (
        <div className="command-actions">
          {renderRecordButton ? (
            <div className="command-record-slot">
              {renderRecordButton()}
            </div>
          ) : null}

          <button
            type="button"
            className="command-action-btn chat neuro-hover-lift"
            onClick={() => onModeChange('chat')}
            disabled={disabled || isProcessing}
            title="Chat-Modus öffnen"
            aria-label="Zum Chat-Modus wechseln"
          >
            <span className="action-icon">💬</span>
            <span className="action-label">Chat</span>
          </button>

          <button
            type="button"
            className="command-action-btn primary submit neuro-button"
            onClick={handleSubmit}
            disabled={disabled || isProcessing || !textValue.trim()}
            title="Gedanken strukturieren"
            aria-label={isProcessing ? 'Verarbeitung läuft' : 'Gedanken strukturieren und speichern'}
          >
            <span className="action-icon">{isProcessing ? '⏳' : '✨'}</span>
            <span className="action-label">
              {isProcessing ? 'Verarbeite...' : 'Strukturieren'}
            </span>
          </button>
        </div>
      )}

      {/* Chat mode: render chat component */}
      {inputMode === 'chat' && (
        <div className="command-chat-container">
          <button
            type="button"
            className="command-action-btn back neuro-hover-lift"
            onClick={() => onModeChange('voice')}
            title="Zurück zu Sprachmemo"
            aria-label="Zurück zum Sprach- und Textmodus"
          >
            <span className="action-icon">←</span>
            <span className="action-label">Zurück</span>
          </button>
          {renderChat?.()}
        </div>
      )}

      {/* AI Status Timeline - shown during processing */}
      {showAIStatus && (
        <div className="ai-status-timeline neuro-tooltip-enhanced" role="status" aria-live="polite">
          <div className="ai-status-header">
            <span className="ai-status-avatar neuro-breathing">{AI_AVATAR.emoji}</span>
            <div className="ai-status-steps">
              {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <span
                    className={`ai-step-dot neuro-status-dot ${
                      index < (currentStepIndex ?? 0)
                        ? 'completed'
                        : index === currentStepIndex
                        ? 'active'
                        : ''
                    }`}
                    title={step.label}
                  />
                  {index < steps.length - 1 && (
                    <span
                      className={`ai-step-connector ${
                        index < (currentStepIndex ?? 0) ? 'completed' : ''
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
            <span className="ai-status-progress">
              {currentStepIndex !== null
                ? `${currentStepIndex + 1}/${steps.length}`
                : ''}
            </span>
          </div>

          <div className="ai-status-message">
            <span className="ai-status-emoji">
              {steps[currentStepIndex ?? 0]?.emoji}
            </span>
            <span className="ai-status-text">
              {steps[currentStepIndex ?? 0]?.description}
            </span>
          </div>

          <div className="ai-status-name">
            {AI_PERSONALITY.name} strukturiert deinen Gedanken...
          </div>
        </div>
      )}
    </div>
  );
};

export const CommandCenter = memo(CommandCenterComponent);
