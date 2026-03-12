/**
 * AIQuestionBubble - Proactive AI question popup
 *
 * Speech-bubble that "emerges" from the FloatingAssistant area,
 * letting the AI proactively ask the user contextual questions.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { AI_PERSONALITY } from '../utils/aiPersonality';
import './AIQuestionBubble.css';

export type QuestionCategory = 'insight' | 'suggestion' | 'question' | 'celebration';

export interface AIQuestionBubbleProps {
  question: string;
  emoji?: string;
  category?: QuestionCategory;
  actionLabel?: string;
  dismissLabel?: string;
  onAction: () => void;
  onDismiss: () => void;
  autoHideAfter?: number; // ms, default 15000
}

const CATEGORY_DEFAULTS: Record<QuestionCategory, { emoji: string; accent: string }> = {
  insight: { emoji: '💡', accent: 'var(--primary)' },
  suggestion: { emoji: '🤔', accent: 'var(--primary)' },
  question: { emoji: '❓', accent: 'var(--info, #3b82f6)' },
  celebration: { emoji: '🎉', accent: 'var(--success)' },
};

const AIQuestionBubbleComponent: React.FC<AIQuestionBubbleProps> = ({
  question,
  emoji,
  category = 'suggestion',
  actionLabel = 'Ja, gerne!',
  dismissLabel = 'Nicht jetzt',
  onAction,
  onDismiss,
  autoHideAfter = 15000,
}) => {
  const [isLeaving, setIsLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const animTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const defaults = CATEGORY_DEFAULTS[category];
  const displayEmoji = emoji || defaults.emoji;

  // Auto-hide after timeout
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, autoHideAfter);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHideAfter]);

  const handleDismiss = () => {
    setIsLeaving(true);
    animTimerRef.current = setTimeout(() => {
      onDismiss();
    }, 250); // match exit animation duration
  };

  const handleAction = () => {
    setIsLeaving(true);
    animTimerRef.current = setTimeout(() => {
      onAction();
    }, 250);
  };

  return (
    <div
      className={`ai-question-bubble ${isLeaving ? 'leaving' : ''}`}
      style={{ '--question-accent': defaults.accent } as React.CSSProperties}
      role="alert"
      aria-live="polite"
    >
      <div className="ai-question-content">
        <div className="ai-question-header">
          <span className="ai-question-emoji" aria-hidden="true">{displayEmoji}</span>
          <span className="ai-question-label">{AI_PERSONALITY.name}</span>
        </div>

        <p className="ai-question-text">{question}</p>

        <div className="ai-question-actions">
          <button
            type="button"
            className="ai-question-btn ai-question-btn-primary"
            onClick={handleAction}
          >
            {actionLabel}
          </button>
          <button
            type="button"
            className="ai-question-btn ai-question-btn-secondary"
            onClick={handleDismiss}
          >
            {dismissLabel}
          </button>
        </div>
      </div>

      {/* Speech bubble arrow pointing down-right toward FloatingAssistant */}
      <div className="ai-question-arrow" aria-hidden="true" />
    </div>
  );
};

export const AIQuestionBubble = memo(AIQuestionBubbleComponent);
