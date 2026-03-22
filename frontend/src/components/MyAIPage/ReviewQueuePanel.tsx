/**
 * ReviewQueuePanel - Gedaechtnis tab for KI-Bewusstsein
 *
 * Phase 141: Gamified FSRS spaced repetition review
 */

import { useState } from 'react';
import type { AIContext } from '../ContextSwitcher';
import {
  useReviewQueue,
  useFSRSStats,
  useSubmitReview,
} from '../../hooks/queries/useCognitiveData';

interface ReviewQueuePanelProps {
  context: AIContext;
}

const GRADE_BUTTONS = [
  { grade: 1, label: 'Vergessen', className: 'review-grade-1' },
  { grade: 2, label: 'Schwer', className: 'review-grade-2' },
  { grade: 3, label: 'Okay', className: 'review-grade-3' },
  { grade: 4, label: 'Leicht', className: 'review-grade-4' },
  { grade: 5, label: 'Perfekt', className: 'review-grade-5' },
] as const;

export function ReviewQueuePanel({ context }: ReviewQueuePanelProps) {
  const queue = useReviewQueue(context);
  const stats = useFSRSStats(context);
  const submitReview = useSubmitReview(context);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);

  const handleGrade = (factId: string, grade: number) => {
    submitReview.mutate(
      { factId, grade },
      {
        onSuccess: () => {
          setReviewedCount(prev => prev + 1);
          setCurrentIndex(prev => prev + 1);
        },
      }
    );
  };

  if (queue.isLoading || stats.isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        <span aria-hidden="true">{'\u{1F9E0}'}</span>
        Lade Wiederholungsaufgaben...
      </div>
    );
  }

  if (queue.isError) {
    return (
      <div className="cognitive-error">
        <div className="cognitive-error-message">Wiederholungsdaten nicht verfuegbar.</div>
        <button className="cognitive-retry-btn" onClick={() => queue.refetch()} type="button">
          Erneut versuchen
        </button>
      </div>
    );
  }

  const items = queue.data ?? [];
  const fsrs = stats.data;
  const currentFact = items[currentIndex];
  const totalDue = items.length;

  return (
    <div className="cognitive-dashboard" role="region" aria-label="Gedaechtnis-Training">
      {/* Stats bar */}
      {fsrs && (
        <div className="cognitive-progress-section">
          <div className="cognitive-section-title">FSRS-Statistiken</div>
          <div className="cognitive-metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.totalWithFSRS}</span>
              <span className="cognitive-metric-label">Gesamt mit FSRS</span>
            </div>
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.dueToday}</span>
              <span className="cognitive-metric-label">Heute faellig</span>
            </div>
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.avgDifficulty.toFixed(1)}</span>
              <span className="cognitive-metric-label">Durchschn. Schwierigkeit</span>
            </div>
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.avgStability.toFixed(1)}</span>
              <span className="cognitive-metric-label">Durchschn. Stabilitaet</span>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {totalDue > 0 && (
        <div className="cognitive-progress-section">
          <div className="cognitive-progress-header">
            <span className="cognitive-progress-label">
              {reviewedCount} von {totalDue + reviewedCount} Fakten heute wiederholt
            </span>
            <span className="cognitive-progress-value">
              {totalDue} verbleibend
            </span>
          </div>
          <div className="cognitive-progress-bar" role="progressbar" aria-valuenow={reviewedCount} aria-valuemin={0} aria-valuemax={totalDue + reviewedCount} aria-label="Wiederholungsfortschritt">
            <div
              className="cognitive-progress-fill high"
              style={{ width: `${totalDue + reviewedCount > 0 ? Math.round((reviewedCount / (totalDue + reviewedCount)) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Review card */}
      {currentFact ? (
        <div className="review-card" role="region" aria-label="Aktuelle Wiederholungskarte">
          <div className="cognitive-gap-description" style={{ marginBottom: 8 }}>
            {currentFact.domain} &middot; Schwierigkeit: {currentFact.fsrs_difficulty.toFixed(1)} &middot; Stabilitaet: {currentFact.fsrs_stability.toFixed(1)}
          </div>
          <div className="review-fact-content">
            {currentFact.content}
          </div>
          <div className="review-grades">
            {GRADE_BUTTONS.map(btn => (
              <button
                key={btn.grade}
                className={`review-grade-btn ${btn.className}`}
                onClick={() => handleGrade(currentFact.id, btn.grade)}
                disabled={submitReview.isPending}
                type="button"
                aria-label={`Bewertung: ${btn.label}`}
              >
                {btn.grade} - {btn.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="cognitive-empty" style={{ padding: '48px 16px' }}>
          <div className="cognitive-empty-icon">{'\u{1F9E0}'}</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
            Alles aufgefrischt!
          </div>
          <div>Keine Fakten zur Wiederholung faellig.</div>
        </div>
      )}
    </div>
  );
}
