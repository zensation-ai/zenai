/**
 * Inline Feedback Component
 * Phase 4: Deep Learning Feedback Loop
 *
 * Provides quick feedback and correction capabilities directly on ideas.
 * Tracks interactions and sends granular corrections to the backend.
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './InlineFeedback.css';

interface InlineFeedbackProps {
  ideaId: string;
  context: 'personal' | 'work';
  currentValues: {
    type?: string;
    category?: string;
    priority?: string;
    title?: string;
    keywords?: string[];
  };
  onCorrectionApplied?: (field: string, newValue: string | string[]) => void;
  compact?: boolean;
}

type CorrectionField = 'type' | 'category' | 'priority' | 'title' | 'keywords';

const TYPE_OPTIONS = [
  { value: 'idea', label: 'Idee', icon: '💡' },
  { value: 'task', label: 'Aufgabe', icon: '✓' },
  { value: 'project', label: 'Projekt', icon: '📁' },
  { value: 'note', label: 'Notiz', icon: '📝' },
  { value: 'question', label: 'Frage', icon: '❓' },
  { value: 'reminder', label: 'Erinnerung', icon: '⏰' },
];

const CATEGORY_OPTIONS = [
  { value: 'personal', label: 'Personal', icon: '🏠' },
  { value: 'work', label: 'Work', icon: '💼' },
  { value: 'health', label: 'Health', icon: '❤️' },
  { value: 'finance', label: 'Finance', icon: '💰' },
  { value: 'learning', label: 'Learning', icon: '📚' },
  { value: 'creative', label: 'Creative', icon: '🎨' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Niedrig', icon: '🟢', color: '#22c55e' },
  { value: 'medium', label: 'Mittel', icon: '🟡', color: '#eab308' },
  { value: 'high', label: 'Hoch', icon: '🔴', color: '#ef4444' },
];

export function InlineFeedback({
  ideaId,
  context,
  currentValues,
  onCorrectionApplied,
  compact = false,
}: InlineFeedbackProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null);
  const [showCorrections, setShowCorrections] = useState(false);
  const [activeCorrection, setActiveCorrection] = useState<CorrectionField | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track feedback (positive/negative)
  const handleFeedback = useCallback(async (isPositive: boolean) => {
    try {
      await axios.post(`/api/${context}/interactions/feedback`, {
        entity_type: 'idea',
        entity_id: ideaId,
        is_positive: isPositive,
      });

      setFeedbackGiven(isPositive ? 'positive' : 'negative');

      if (!isPositive) {
        setShowCorrections(true);
      }

      showToast(
        isPositive ? 'Danke für dein Feedback!' : 'Was war nicht richtig?',
        isPositive ? 'success' : 'info'
      );
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  }, [context, ideaId]);

  // Submit a correction
  const handleCorrection = useCallback(async (field: CorrectionField, newValue: string | string[]) => {
    if (isSubmitting) return;

    const oldValue = currentValues[field];
    if (oldValue === newValue) {
      setActiveCorrection(null);
      return;
    }

    setIsSubmitting(true);

    try {
      await axios.post(`/api/${context}/corrections`, {
        idea_id: ideaId,
        field,
        old_value: Array.isArray(oldValue) ? JSON.stringify(oldValue) : oldValue,
        new_value: Array.isArray(newValue) ? JSON.stringify(newValue) : newValue,
        weight: 5.0, // Corrections are weighted 5x
      });

      showToast(`${field} korrigiert - ich lerne dazu!`, 'success');
      setActiveCorrection(null);

      if (onCorrectionApplied) {
        onCorrectionApplied(field, newValue);
      }
    } catch (error) {
      showToast('Korrektur fehlgeschlagen', 'error');
      console.error('Failed to submit correction:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [context, ideaId, currentValues, isSubmitting, onCorrectionApplied]);

  // Render correction options for a field
  const renderCorrectionOptions = (field: CorrectionField) => {
    let options: Array<{ value: string; label: string; icon: string; color?: string }> = [];

    switch (field) {
      case 'type':
        options = TYPE_OPTIONS;
        break;
      case 'category':
        options = CATEGORY_OPTIONS;
        break;
      case 'priority':
        options = PRIORITY_OPTIONS;
        break;
      default:
        return null;
    }

    const currentValue = currentValues[field];

    return (
      <div className="correction-options">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`correction-option ${currentValue === option.value ? 'current' : ''}`}
            onClick={() => handleCorrection(field, option.value)}
            disabled={isSubmitting || currentValue === option.value}
            style={option.color ? { '--option-color': option.color } as React.CSSProperties : undefined}
          >
            <span className="option-icon">{option.icon}</span>
            <span className="option-label">{option.label}</span>
          </button>
        ))}
      </div>
    );
  };

  if (compact) {
    return (
      <div className="inline-feedback compact">
        <div className="feedback-quick">
          <button
            type="button"
            className={`feedback-btn positive ${feedbackGiven === 'positive' ? 'active' : ''}`}
            onClick={() => handleFeedback(true)}
            disabled={feedbackGiven !== null}
            title="Gut strukturiert"
          >
            👍
          </button>
          <button
            type="button"
            className={`feedback-btn negative ${feedbackGiven === 'negative' ? 'active' : ''}`}
            onClick={() => handleFeedback(false)}
            disabled={feedbackGiven !== null}
            title="Korrektur nötig"
          >
            👎
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-feedback">
      {/* Quick Feedback Buttons */}
      <div className="feedback-row">
        <span className="feedback-label">War das richtig?</span>
        <div className="feedback-buttons">
          <button
            type="button"
            className={`feedback-btn positive ${feedbackGiven === 'positive' ? 'active' : ''}`}
            onClick={() => handleFeedback(true)}
            disabled={feedbackGiven !== null}
          >
            👍 Ja
          </button>
          <button
            type="button"
            className={`feedback-btn negative ${feedbackGiven === 'negative' ? 'active' : ''}`}
            onClick={() => handleFeedback(false)}
            disabled={feedbackGiven !== null}
          >
            👎 Nein
          </button>
        </div>
      </div>

      {/* Correction Interface */}
      {showCorrections && (
        <div className="corrections-panel">
          <div className="corrections-header">
            <span>Was soll korrigiert werden?</span>
            <button
              type="button"
              className="close-btn"
              onClick={() => {
                setShowCorrections(false);
                setActiveCorrection(null);
              }}
            >
              ✕
            </button>
          </div>

          <div className="correction-fields">
            {/* Type Correction */}
            <div className={`correction-field ${activeCorrection === 'type' ? 'expanded' : ''}`}>
              <button
                type="button"
                className="field-trigger"
                onClick={() => setActiveCorrection(activeCorrection === 'type' ? null : 'type')}
              >
                <span className="field-label">Typ</span>
                <span className="field-value">
                  {TYPE_OPTIONS.find(o => o.value === currentValues.type)?.icon || '💡'}
                  {TYPE_OPTIONS.find(o => o.value === currentValues.type)?.label || currentValues.type}
                </span>
                <span className="expand-icon">{activeCorrection === 'type' ? '▼' : '▶'}</span>
              </button>
              {activeCorrection === 'type' && renderCorrectionOptions('type')}
            </div>

            {/* Category Correction */}
            <div className={`correction-field ${activeCorrection === 'category' ? 'expanded' : ''}`}>
              <button
                type="button"
                className="field-trigger"
                onClick={() => setActiveCorrection(activeCorrection === 'category' ? null : 'category')}
              >
                <span className="field-label">Kategorie</span>
                <span className="field-value">
                  {CATEGORY_OPTIONS.find(o => o.value === currentValues.category)?.icon || '📁'}
                  {CATEGORY_OPTIONS.find(o => o.value === currentValues.category)?.label || currentValues.category}
                </span>
                <span className="expand-icon">{activeCorrection === 'category' ? '▼' : '▶'}</span>
              </button>
              {activeCorrection === 'category' && renderCorrectionOptions('category')}
            </div>

            {/* Priority Correction */}
            <div className={`correction-field ${activeCorrection === 'priority' ? 'expanded' : ''}`}>
              <button
                type="button"
                className="field-trigger"
                onClick={() => setActiveCorrection(activeCorrection === 'priority' ? null : 'priority')}
              >
                <span className="field-label">Priorität</span>
                <span className="field-value">
                  {PRIORITY_OPTIONS.find(o => o.value === currentValues.priority)?.icon || '🟡'}
                  {PRIORITY_OPTIONS.find(o => o.value === currentValues.priority)?.label || currentValues.priority}
                </span>
                <span className="expand-icon">{activeCorrection === 'priority' ? '▼' : '▶'}</span>
              </button>
              {activeCorrection === 'priority' && renderCorrectionOptions('priority')}
            </div>
          </div>

          <p className="corrections-hint">
            Deine Korrekturen helfen mir, besser zu werden!
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compact feedback indicator for list views
 */
export function FeedbackIndicator({
  ideaId,
  context,
  onFeedback,
}: {
  ideaId: string;
  context: 'personal' | 'work';
  onFeedback?: (isPositive: boolean) => void;
}) {
  const [given, setGiven] = useState<boolean | null>(null);

  const handleClick = async (isPositive: boolean) => {
    if (given !== null) return;

    try {
      await axios.post(`/api/${context}/interactions/feedback`, {
        entity_type: 'idea',
        entity_id: ideaId,
        is_positive: isPositive,
      });
      setGiven(isPositive);
      onFeedback?.(isPositive);
    } catch (error) {
      console.error('Feedback failed:', error);
    }
  };

  if (given !== null) {
    return (
      <span className={`feedback-indicator ${given ? 'positive' : 'negative'}`}>
        {given ? '✓' : '✎'}
      </span>
    );
  }

  return (
    <span className="feedback-indicator-buttons">
      <button
        type="button"
        className="indicator-btn"
        onClick={(e) => { e.stopPropagation(); handleClick(true); }}
        title="Richtig"
      >
        ✓
      </button>
      <button
        type="button"
        className="indicator-btn"
        onClick={(e) => { e.stopPropagation(); handleClick(false); }}
        title="Korrigieren"
      >
        ✎
      </button>
    </span>
  );
}
