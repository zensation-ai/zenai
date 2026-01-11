import { useState } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './AIFeedback.css';

interface AIFeedbackProps {
  responseType: string;
  originalResponse: string;
  context: string;
  compact?: boolean;
}

export function AIFeedback({
  responseType,
  originalResponse,
  context,
  compact = false,
}: AIFeedbackProps) {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleThumbsUp = async () => {
    if (feedback === 'positive') return;

    setSubmitting(true);
    try {
      await axios.post(`/api/${context}/feedback/thumbs-up`, {
        response_type: responseType,
        original_response: originalResponse,
      });
      setFeedback('positive');
      showToast('Danke fuer das Feedback!', 'success');
    } catch (error) {
      showToast('Feedback fehlgeschlagen', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleThumbsDown = async () => {
    if (feedback === 'negative') {
      setShowCorrection(true);
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`/api/${context}/feedback/thumbs-down`, {
        response_type: responseType,
        original_response: originalResponse,
      });
      setFeedback('negative');
      setShowCorrection(true);
      showToast('Feedback gespeichert. Moechtest du korrigieren?', 'info');
    } catch (error) {
      showToast('Feedback fehlgeschlagen', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCorrection = async () => {
    if (!correction.trim()) {
      showToast('Bitte gib eine Korrektur ein', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`/api/${context}/feedback/correction`, {
        response_type: responseType,
        original_response: originalResponse,
        correction: correction.trim(),
      });
      showToast('Korrektur gespeichert. Die KI lernt davon!', 'success');
      setShowCorrection(false);
      setCorrection('');
    } catch (error) {
      showToast('Korrektur fehlgeschlagen', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (compact) {
    return (
      <div className="ai-feedback compact">
        <button
          type="button"
          className={`feedback-btn thumbs-up ${feedback === 'positive' ? 'active' : ''}`}
          onClick={handleThumbsUp}
          disabled={submitting}
          title="Gute Antwort"
          aria-label="Positive Bewertung"
        >
          {feedback === 'positive' ? '👍' : '👍🏻'}
        </button>
        <button
          type="button"
          className={`feedback-btn thumbs-down ${feedback === 'negative' ? 'active' : ''}`}
          onClick={handleThumbsDown}
          disabled={submitting}
          title="Verbesserung noetig"
          aria-label="Negative Bewertung"
        >
          {feedback === 'negative' ? '👎' : '👎🏻'}
        </button>
      </div>
    );
  }

  return (
    <div className="ai-feedback">
      <div className="feedback-prompt">
        <span className="feedback-label">War diese Strukturierung hilfreich?</span>
        <div className="feedback-buttons">
          <button
            type="button"
            className={`feedback-btn thumbs-up ${feedback === 'positive' ? 'active' : ''}`}
            onClick={handleThumbsUp}
            disabled={submitting}
            aria-label="Positive Bewertung"
          >
            👍 Ja
          </button>
          <button
            type="button"
            className={`feedback-btn thumbs-down ${feedback === 'negative' ? 'active' : ''}`}
            onClick={handleThumbsDown}
            disabled={submitting}
            aria-label="Negative Bewertung"
          >
            👎 Nein
          </button>
        </div>
      </div>

      {showCorrection && (
        <div className="correction-form">
          <label htmlFor="correction-input">Wie haette die Antwort lauten sollen?</label>
          <textarea
            id="correction-input"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Beschreibe die korrekte Strukturierung..."
            rows={3}
          />
          <div className="correction-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={() => setShowCorrection(false)}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="submit-btn"
              onClick={handleSubmitCorrection}
              disabled={submitting || !correction.trim()}
            >
              {submitting ? 'Speichern...' : 'Korrektur senden'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIFeedback;
