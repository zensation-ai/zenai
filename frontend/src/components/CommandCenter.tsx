import React, { useState, useRef, useCallback, memo } from 'react';
import { TEXT_PROCESSING_STEPS } from '../utils/aiSteps';
import { AI_PERSONALITY } from '../utils/aiPersonality';
import './CommandCenter.css';

export type InputMode = 'voice' | 'chat';
export type AIActivityType = 'thinking' | 'transcribing' | 'searching' | 'processing' | 'learning' | 'success';

interface CommandCenterProps {
  context: 'personal' | 'work';
  persona: string;
  isAIActive: boolean;
  aiActivityType: AIActivityType;
  currentStepIndex: number | null;
  textValue: string;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  onModeChange: (mode: InputMode) => void;
  onRecordClick: () => void;
  inputMode: InputMode;
  isRecording: boolean;
  isProcessing: boolean;
  disabled?: boolean;
}

const MAX_CHARS = 10000;

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
  persona: _persona,
  isAIActive,
  aiActivityType: _aiActivityType,
  currentStepIndex,
  textValue,
  onTextChange,
  onSubmit,
  onModeChange,
  onRecordClick,
  inputMode,
  isRecording,
  isProcessing,
  disabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length <= MAX_CHARS) {
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

  const charsRemaining = MAX_CHARS - textValue.length;
  const showCharWarning = charsRemaining < 500;
  const steps = TEXT_PROCESSING_STEPS;
  const showAIStatus = isAIActive && currentStepIndex !== null && currentStepIndex >= 0;

  return (
    <div
      className={`command-center ${isFocused ? 'focused' : ''} ${
        isProcessing ? 'processing' : ''
      }`}
      data-context={context}
    >
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

      <div className="command-actions">
        <button
          type="button"
          className={`command-action-btn record ${isRecording ? 'recording' : ''}`}
          onClick={onRecordClick}
          disabled={disabled || isProcessing}
          title={isRecording ? 'Aufnahme stoppen' : 'Sprachmemo aufnehmen'}
        >
          <span className="action-icon">{isRecording ? '⏹️' : '🎤'}</span>
          <span className="action-label">
            {isRecording ? 'Stoppen' : 'Aufnehmen'}
          </span>
        </button>

        <button
          type="button"
          className={`command-action-btn chat ${inputMode === 'chat' ? 'active' : ''}`}
          onClick={() => onModeChange(inputMode === 'chat' ? 'voice' : 'chat')}
          disabled={disabled || isProcessing}
          title="Chat-Modus öffnen"
        >
          <span className="action-icon">💬</span>
          <span className="action-label">Chat</span>
        </button>

        <button
          type="button"
          className="command-action-btn primary submit"
          onClick={handleSubmit}
          disabled={disabled || isProcessing || !textValue.trim()}
          title="Gedanken strukturieren"
        >
          <span className="action-icon">{isProcessing ? '⏳' : '✨'}</span>
          <span className="action-label">
            {isProcessing ? 'Verarbeite...' : 'Strukturieren'}
          </span>
        </button>
      </div>

      {/* AI Status Timeline - shown during processing */}
      {showAIStatus && (
        <div className="ai-status-timeline" role="status" aria-live="polite">
          <div className="ai-status-header">
            <span className="ai-status-avatar">🧠</span>
            <div className="ai-status-steps">
              {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <span
                    className={`ai-step-dot ${
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
