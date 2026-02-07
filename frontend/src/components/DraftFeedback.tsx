/**
 * Phase 5: Draft Feedback Components
 *
 * Provides UI for collecting user feedback on AI-generated drafts.
 * Includes quick feedback (thumbs up/down) and detailed feedback forms.
 */

import { useState } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { useContextState } from './ContextSwitcher';
import './DraftFeedback.css';
import { logError } from '../utils/errors';

// ===========================================
// Types
// ===========================================

interface DraftFeedbackProps {
  draftId: string;
  draftType: string;
  wordCount: number;
  onFeedbackSubmitted?: () => void;
}

interface QualityAspects {
  accuracy?: number;
  tone?: number;
  completeness?: number;
  relevance?: number;
  structure?: number;
}

type EditCategory = 'tone' | 'length' | 'content' | 'structure' | 'formatting' | 'accuracy';

// ===========================================
// Quick Feedback Component (Thumbs up/down)
// ===========================================

export function QuickFeedback({ draftId, onFeedbackSubmitted }: { draftId: string; onFeedbackSubmitted?: () => void }) {
  const [context] = useContextState();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(null);

  const submitQuickFeedback = async (isPositive: boolean) => {
    if (submitting || submitted) return;

    setSubmitting(true);
    try {
      await axios.post(`/api/${context}/drafts/${draftId}/feedback/quick`, { isPositive });
      setSubmitted(isPositive ? 'positive' : 'negative');
      showToast(isPositive ? 'Danke für das Feedback!' : 'Danke, wir verbessern uns!', 'success');
      onFeedbackSubmitted?.();
    } catch (error) {
      logError('DraftFeedback:submitQuickFeedback', error);
      showToast('Feedback konnte nicht gesendet werden', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="quick-feedback submitted">
        <span className="feedback-thanks">
          {submitted === 'positive' ? '👍' : '👎'} Feedback gespeichert
        </span>
      </div>
    );
  }

  return (
    <div className="quick-feedback">
      <span className="feedback-prompt">War dieser Entwurf hilfreich?</span>
      <div className="feedback-buttons">
        <button
          type="button"
          className="feedback-btn positive"
          onClick={() => submitQuickFeedback(true)}
          disabled={submitting}
          title="Hilfreich"
        >
          👍
        </button>
        <button
          type="button"
          className="feedback-btn negative"
          onClick={() => submitQuickFeedback(false)}
          disabled={submitting}
          title="Nicht hilfreich"
        >
          👎
        </button>
      </div>
    </div>
  );
}

// ===========================================
// Star Rating Component
// ===========================================

function StarRating({
  value,
  onChange,
  label,
  size = 'normal',
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  size?: 'small' | 'normal' | 'large';
}) {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div className={`star-rating size-${size}`}>
      {label && <span className="star-rating-label">{label}</span>}
      <div className="stars-container">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star ${star <= (hoverValue || value) ? 'filled' : ''}`}
            onMouseEnter={() => setHoverValue(star)}
            onMouseLeave={() => setHoverValue(0)}
            onClick={() => onChange(star)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

// ===========================================
// Content Reuse Slider
// ===========================================

function ContentReuseSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const getLabel = (percent: number) => {
    if (percent <= 20) return 'Fast nichts übernommen';
    if (percent <= 40) return 'Wenig übernommen';
    if (percent <= 60) return 'Etwa die Hälfte';
    if (percent <= 80) return 'Großteil übernommen';
    return 'Fast alles übernommen';
  };

  return (
    <div className="content-reuse-slider">
      <label className="slider-label">
        Wie viel vom Entwurf hast du übernommen?
      </label>
      <div className="slider-container">
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="slider"
        />
        <div className="slider-value">
          <span className="percent">{value}%</span>
          <span className="label">{getLabel(value)}</span>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Edit Categories Selector
// ===========================================

const EDIT_CATEGORIES: { value: EditCategory; label: string; icon: string }[] = [
  { value: 'tone', label: 'Tonalität', icon: '🎭' },
  { value: 'length', label: 'Länge', icon: '📏' },
  { value: 'content', label: 'Inhalt', icon: '📝' },
  { value: 'structure', label: 'Struktur', icon: '🏗️' },
  { value: 'formatting', label: 'Formatierung', icon: '✨' },
  { value: 'accuracy', label: 'Genauigkeit', icon: '🎯' },
];

function EditCategoriesSelector({
  selected,
  onChange,
}: {
  selected: EditCategory[];
  onChange: (categories: EditCategory[]) => void;
}) {
  const toggleCategory = (category: EditCategory) => {
    if (selected.includes(category)) {
      onChange(selected.filter((c) => c !== category));
    } else {
      onChange([...selected, category]);
    }
  };

  return (
    <div className="edit-categories">
      <label className="categories-label">Was hast du geändert?</label>
      <div className="categories-grid">
        {EDIT_CATEGORIES.map(({ value, label, icon }) => (
          <button
            key={value}
            type="button"
            className={`category-chip ${selected.includes(value) ? 'selected' : ''}`}
            onClick={() => toggleCategory(value)}
          >
            <span className="chip-icon">{icon}</span>
            <span className="chip-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ===========================================
// Quality Aspects Rater
// ===========================================

const QUALITY_ASPECTS: { key: keyof QualityAspects; label: string }[] = [
  { key: 'accuracy', label: 'Genauigkeit' },
  { key: 'tone', label: 'Tonalität' },
  { key: 'completeness', label: 'Vollständigkeit' },
  { key: 'relevance', label: 'Relevanz' },
  { key: 'structure', label: 'Struktur' },
];

function QualityAspectsRater({
  aspects,
  onChange,
}: {
  aspects: QualityAspects;
  onChange: (aspects: QualityAspects) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        className="expand-quality-btn"
        onClick={() => setExpanded(true)}
      >
        + Detailliertes Feedback geben
      </button>
    );
  }

  return (
    <div className="quality-aspects">
      <label className="aspects-label">Bewerte die Qualitätsaspekte:</label>
      <div className="aspects-grid">
        {QUALITY_ASPECTS.map(({ key, label }) => (
          <div key={key} className="aspect-row">
            <StarRating
              value={aspects[key] || 0}
              onChange={(value) => onChange({ ...aspects, [key]: value })}
              label={label}
              size="small"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================
// Main Detailed Feedback Form
// ===========================================

export function DraftFeedbackForm({
  draftId,
  draftType: _draftType, // Reserved for type-specific prompts
  wordCount: _wordCount, // Reserved for analytics
  onFeedbackSubmitted,
}: DraftFeedbackProps) {
  void _draftType; // Suppress unused warning
  void _wordCount; // Suppress unused warning

  const [context] = useContextState();
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [contentReusedPercent, setContentReusedPercent] = useState(70);
  const [editCategories, setEditCategories] = useState<EditCategory[]>([]);
  const [wasHelpful, setWasHelpful] = useState<boolean | null>(null);
  const [wouldUseAgain, setWouldUseAgain] = useState<boolean | null>(null);
  const [qualityAspects, setQualityAspects] = useState<QualityAspects>({});

  const submitFeedback = async () => {
    if (rating === 0) {
      showToast('Bitte eine Bewertung abgeben', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`/api/${context}/drafts/${draftId}/feedback/detailed`, {
        rating,
        feedbackText: feedbackText || undefined,
        contentReusedPercent,
        editCategories: editCategories.length > 0 ? editCategories : undefined,
        wasHelpful,
        wouldUseAgain,
        qualityAspects: Object.keys(qualityAspects).length > 0 ? qualityAspects : undefined,
        feedbackSource: 'manual',
      });

      setSubmitted(true);
      showToast('Vielen Dank für dein Feedback!', 'success');
      onFeedbackSubmitted?.();
    } catch (error) {
      logError('DraftFeedback:submitFeedback', error);
      showToast('Feedback konnte nicht gesendet werden', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="draft-feedback submitted">
        <div className="feedback-success">
          <span className="success-icon">✓</span>
          <span className="success-text">Feedback gespeichert</span>
        </div>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="draft-feedback collapsed">
        <button
          type="button"
          className="open-feedback-btn"
          onClick={() => setIsOpen(true)}
        >
          ⭐ Feedback geben
        </button>
      </div>
    );
  }

  return (
    <div className="draft-feedback expanded">
      <div className="feedback-header">
        <h4>Wie war dieser Entwurf?</h4>
        <button
          type="button"
          className="close-feedback-btn"
          onClick={() => setIsOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="feedback-form">
        {/* Main Rating */}
        <div className="form-section main-rating">
          <StarRating
            value={rating}
            onChange={setRating}
            label="Gesamtbewertung"
            size="large"
          />
        </div>

        {/* Quick helpful buttons */}
        <div className="form-section helpful-section">
          <label>War der Entwurf hilfreich?</label>
          <div className="helpful-buttons">
            <button
              type="button"
              className={`helpful-btn ${wasHelpful === true ? 'selected' : ''}`}
              onClick={() => setWasHelpful(wasHelpful === true ? null : true)}
            >
              👍 Ja
            </button>
            <button
              type="button"
              className={`helpful-btn ${wasHelpful === false ? 'selected' : ''}`}
              onClick={() => setWasHelpful(wasHelpful === false ? null : false)}
            >
              👎 Nein
            </button>
          </div>
        </div>

        {/* Content Reuse Slider */}
        <div className="form-section">
          <ContentReuseSlider
            value={contentReusedPercent}
            onChange={setContentReusedPercent}
          />
        </div>

        {/* Edit Categories */}
        {contentReusedPercent < 90 && (
          <div className="form-section">
            <EditCategoriesSelector
              selected={editCategories}
              onChange={setEditCategories}
            />
          </div>
        )}

        {/* Free text feedback */}
        <div className="form-section">
          <label htmlFor="feedback-text">Zusätzliches Feedback (optional)</label>
          <textarea
            id="feedback-text"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Was hat gut funktioniert? Was könnte besser sein?"
            rows={3}
          />
        </div>

        {/* Quality Aspects (expandable) */}
        <div className="form-section">
          <QualityAspectsRater
            aspects={qualityAspects}
            onChange={setQualityAspects}
          />
        </div>

        {/* Would use again */}
        <div className="form-section use-again-section">
          <label>Würdest du diese Funktion wieder nutzen?</label>
          <div className="use-again-buttons">
            <button
              type="button"
              className={`use-again-btn ${wouldUseAgain === true ? 'selected' : ''}`}
              onClick={() => setWouldUseAgain(wouldUseAgain === true ? null : true)}
            >
              ✓ Ja
            </button>
            <button
              type="button"
              className={`use-again-btn ${wouldUseAgain === false ? 'selected' : ''}`}
              onClick={() => setWouldUseAgain(wouldUseAgain === false ? null : false)}
            >
              ✗ Nein
            </button>
          </div>
        </div>

        {/* Submit button */}
        <div className="form-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={() => setIsOpen(false)}
            disabled={submitting}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="submit-btn"
            onClick={submitFeedback}
            disabled={submitting || rating === 0}
          >
            {submitting ? 'Wird gesendet...' : 'Feedback senden'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Feedback Prompt (Post-copy popup)
// ===========================================

export function FeedbackPrompt({
  draftId,
  onDismiss,
  onFeedbackSubmitted,
}: {
  draftId: string;
  onDismiss: () => void;
  onFeedbackSubmitted?: () => void;
}) {
  const [context] = useContextState();
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const submitQuickRating = async () => {
    if (rating === 0) return;

    setSubmitting(true);
    try {
      await axios.post(`/api/${context}/drafts/${draftId}/feedback/detailed`, {
        rating,
        feedbackSource: 'prompt',
      });
      showToast('Danke für das Feedback!', 'success');
      onFeedbackSubmitted?.();
      onDismiss();
    } catch (error) {
      logError('DraftFeedback:submitRating', error);
      showToast('Feedback konnte nicht gesendet werden', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="feedback-prompt-overlay" onClick={onDismiss} role="presentation">
      <div className="feedback-prompt-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Entwurf bewerten">
        <button type="button" className="prompt-close" onClick={onDismiss} aria-label="Schließen">×</button>
        <h4>Wie war der Entwurf?</h4>
        <StarRating value={rating} onChange={setRating} size="large" />
        <div className="prompt-actions">
          <button
            className="prompt-skip"
            onClick={onDismiss}
          >
            Überspringen
          </button>
          <button
            className="prompt-submit"
            onClick={submitQuickRating}
            disabled={rating === 0 || submitting}
          >
            {submitting ? '...' : 'Bewerten'}
          </button>
        </div>
      </div>
    </div>
  );
}
