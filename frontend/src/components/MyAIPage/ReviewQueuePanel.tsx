/**
 * ReviewQueuePanel - Enhanced FSRS Spaced Repetition Review UI
 *
 * 4 Sections:
 * 1. Stats Dashboard (metrics + streak)
 * 2. Review Card (fact content, difficulty gauge, grade buttons, keyboard shortcuts)
 * 3. Retention Curve (SVG chart via RetentionChart)
 * 4. Review Calendar (4-week heatmap via ReviewCalendar)
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { AIContext } from '../ContextSwitcher';
import {
  useReviewQueue,
  useFSRSStats,
  useSubmitReview,
  useRetentionCurve,
} from '../../hooks/queries/useCognitiveData';
import { RetentionChart } from './RetentionChart';
import { ReviewCalendar } from './ReviewCalendar';

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

function getDifficultyColor(difficulty: number): string {
  // 1 = easy (green), 10 = hard (red)
  if (difficulty <= 3) return '#22c55e';
  if (difficulty <= 5) return '#eab308';
  if (difficulty <= 7) return '#f97316';
  return '#ef4444';
}

function formatCountdown(nextReview: string): { text: string; overdue: boolean } {
  const now = new Date();
  const target = new Date(nextReview);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return { text: `Nächste Wiederholung in ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`, overdue: false };
  } else if (diffDays === 0) {
    return { text: 'Heute fällig', overdue: false };
  } else {
    const abs = Math.abs(diffDays);
    return { text: `Überfällig seit ${abs} Tag${abs !== 1 ? 'en' : ''}`, overdue: true };
  }
}

export function ReviewQueuePanel({ context }: ReviewQueuePanelProps) {
  const queue = useReviewQueue(context);
  const stats = useFSRSStats(context);
  const submitReview = useSubmitReview(context);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);

  const items = queue.data ?? [];
  const currentFact = items[currentIndex];
  const totalDue = items.length;

  const retentionCurve = useRetentionCurve(context, currentFact?.id ?? null);

  const handleGrade = useCallback((factId: string, grade: number) => {
    submitReview.mutate(
      { factId, grade },
      {
        onSuccess: () => {
          setReviewedCount(prev => prev + 1);
          setCurrentIndex(prev => prev + 1);
        },
      }
    );
  }, [submitReview]);

  // Keyboard shortcuts 1-5
  useEffect(() => {
    if (!currentFact) return;

    const handler = (e: KeyboardEvent) => {
      const grade = parseInt(e.key, 10);
      if (grade >= 1 && grade <= 5 && !submitReview.isPending) {
        handleGrade(currentFact.id, grade);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentFact, submitReview.isPending, handleGrade]);

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
        <div className="cognitive-error-message">Wiederholungsdaten nicht verfügbar.</div>
        <button className="cognitive-retry-btn" onClick={() => queue.refetch()} type="button">
          Erneut versuchen
        </button>
      </div>
    );
  }

  const fsrs = stats.data;

  // Calculate next review day offset for retention chart
  let nextReviewDay: number | undefined;
  if (currentFact?.fsrs_next_review) {
    const diffMs = new Date(currentFact.fsrs_next_review).getTime() - Date.now();
    nextReviewDay = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  }

  return (
    <div className="cognitive-dashboard" role="region" aria-label="Gedächtnis-Training">
      {/* ── Section 1: Stats Dashboard ──────────────────────────────── */}
      {fsrs && (
        <div className="cognitive-progress-section">
          <div className="cognitive-section-title">FSRS-Statistiken</div>
          <div className="cognitive-metrics-grid grid-cols-4">
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.totalWithFSRS}</span>
              <span className="cognitive-metric-label">Gesamt mit FSRS</span>
            </div>
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.dueToday}</span>
              <span className="cognitive-metric-label">Heute fällig</span>
            </div>
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.avgDifficulty.toFixed(1)}</span>
              <span className="cognitive-metric-label">Durchschn. Schwierigkeit</span>
            </div>
            <div className="cognitive-metric-card">
              <span className="cognitive-metric-value">{fsrs.avgStability.toFixed(1)}</span>
              <span className="cognitive-metric-label">Durchschn. Stabilität</span>
            </div>
          </div>
          {reviewedCount > 0 && (
            <div className="review-streak" data-testid="review-streak">
              {'\u{1F525}'} {reviewedCount} Fakt{reviewedCount !== 1 ? 'en' : ''} heute wiederholt!
            </div>
          )}
        </div>
      )}

      {/* ── Section 2: Review Card ─────────────────────────────────── */}
      {totalDue > 0 && (
        <div className="cognitive-progress-section">
          <div className="cognitive-progress-header">
            <span className="cognitive-progress-label">
              {reviewedCount} von {totalDue + reviewedCount} Fakten wiederholt
            </span>
            <span className="cognitive-progress-value">
              {totalDue} verbleibend
            </span>
          </div>
          <div
            className="cognitive-progress-bar"
            role="progressbar"
            aria-valuenow={reviewedCount}
            aria-valuemin={0}
            aria-valuemax={totalDue + reviewedCount}
            aria-label="Wiederholungsfortschritt"
          >
            <div
              className="cognitive-progress-fill high w-[var(--bar)]"
              style={{ '--bar': `${totalDue + reviewedCount > 0 ? Math.round((reviewedCount / (totalDue + reviewedCount)) * 100) : 0}%` } as CSSProperties}
            />
          </div>
        </div>
      )}

      {currentFact ? (
        <div className="review-card" role="region" aria-label="Aktuelle Wiederholungskarte">
          {/* Difficulty gauge + Stability bar */}
          <div className="review-card-meta">
            <div className="difficulty-gauge" data-testid="difficulty-gauge">
              <svg viewBox="0 0 80 48" className="difficulty-gauge-svg">
                {/* Background arc */}
                <path
                  d="M 8 44 A 32 32 0 0 1 72 44"
                  fill="none"
                  stroke="var(--border, rgba(0,0,0,0.08))"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                {/* Value arc */}
                <path
                  d="M 8 44 A 32 32 0 0 1 72 44"
                  fill="none"
                  stroke={getDifficultyColor(currentFact.fsrs_difficulty)}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(currentFact.fsrs_difficulty / 10) * 100.5} 100.5`}
                />
                <text
                  x="40"
                  y="40"
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="700"
                  fill="var(--text, #0f172a)"
                >
                  {currentFact.fsrs_difficulty.toFixed(1)}
                </text>
                <text
                  x="40"
                  y="48"
                  textAnchor="middle"
                  fontSize="7"
                  fill="var(--text-secondary, #64748b)"
                >
                  Schwierigkeit
                </text>
              </svg>
            </div>
            <div className="review-stability-info">
              <div className="review-stability-bar-label">
                Stabilität: {currentFact.fsrs_stability.toFixed(1)} Tage
              </div>
              <div className="review-stability-bar">
                <div
                  className="review-stability-fill w-[var(--bar)]"
                  style={{ '--bar': `${Math.min(100, (currentFact.fsrs_stability / 30) * 100)}%` } as CSSProperties}
                />
              </div>
              {currentFact.fsrs_next_review && (() => {
                const { text, overdue } = formatCountdown(currentFact.fsrs_next_review);
                return (
                  <div className={`review-countdown${overdue ? ' overdue' : ''}`}>
                    {text}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Fact content */}
          <div className="review-fact-content">
            {currentFact.content}
          </div>

          {/* Grade buttons */}
          <div className="review-grades" data-testid="review-grades">
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
          <div className="keyboard-hint">Tastenkürzel: 1-5</div>
        </div>
      ) : (
        <div className="cognitive-empty px-4 py-12" data-testid="review-empty-state">
          <div className="cognitive-empty-icon">{'\u2705'}</div>
          <div className="text-[15px] font-medium mb-1">
            Alles aufgefrischt!
          </div>
          <div>Keine Fakten zur Wiederholung fällig.</div>
        </div>
      )}

      {/* ── Section 3: Retention Curve ─────────────────────────────── */}
      {currentFact && retentionCurve.data && (
        <div className="cognitive-progress-section">
          <div className="cognitive-section-title">Behaltenskurve</div>
          <RetentionChart
            curvePoints={retentionCurve.data.curvePoints}
            nextReviewDay={nextReviewDay}
            targetRetention={0.9}
          />
        </div>
      )}

      {/* ── Section 4: Review Calendar ─────────────────────────────── */}
      <div className="cognitive-progress-section">
        <ReviewCalendar reviewQueue={items} />
      </div>
    </div>
  );
}
