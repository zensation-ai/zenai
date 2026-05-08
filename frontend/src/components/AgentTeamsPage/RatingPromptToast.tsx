/**
 * RatingPromptToast — Inline 1-5 star rating form for installed marketplace blueprints.
 *
 * Fetches rating eligibility, then either:
 *   - shows the 5-star form (eligible or already rated — edit existing)
 *   - shows a short info banner (not installed, or not enough executions)
 *
 * Sprint 1.11
 */

import { useEffect, useState } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';

export interface RatingEligibility {
  eligible: boolean;
  installed: boolean;
  alreadyRated: boolean;
  existingRating: number | null;
  existingReview: string | null;
  executionCount: number;
  executionsRequired: number;
}

interface Props {
  blueprintId: string;
  onClose: () => void;
  onSubmitted?: () => void;
  eligibilityOverride?: RatingEligibility; // for tests
}

export function RatingPromptToast({ blueprintId, onClose, onSubmitted, eligibilityOverride }: Props) {
  const [eligibility, setEligibility] = useState<RatingEligibility | null>(eligibilityOverride ?? null);
  const [loading, setLoading] = useState(!eligibilityOverride);
  const [rating, setRating] = useState<number>(eligibilityOverride?.existingRating ?? 0);
  const [review, setReview] = useState<string>(eligibilityOverride?.existingReview ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (eligibilityOverride) return;
    let cancelled = false;
    setLoading(true);
    axios
      .get(`/api/marketplace/blueprints/${blueprintId}/rating-eligibility`)
      .then(res => {
        if (cancelled) return;
        const data = (res.data?.data ?? null) as RatingEligibility | null;
        setEligibility(data);
        if (data?.existingRating) setRating(data.existingRating);
        if (data?.existingReview) setReview(data.existingReview);
      })
      .catch(err => {
        if (cancelled) return;
        logError('RatingPromptToast:load', err);
        setError('Verfügbarkeit konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [blueprintId, eligibilityOverride]);

  const canSubmit = rating >= 1 && rating <= 5 && !submitting && eligibility?.installed;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await axios.post(`/api/marketplace/blueprints/${blueprintId}/rate`, {
        rating,
        review: review.trim() ? review.trim() : undefined,
      });
      setSuccess(true);
      onSubmitted?.();
    } catch (err) {
      logError('RatingPromptToast:submit', err);
      setError('Bewertung konnte nicht gespeichert werden.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Blueprint bewerten"
      data-testid="rating-prompt-toast"
      className="fixed bottom-4 right-4 z-[70] max-w-sm w-[calc(100vw-2rem)] liquid-glass rounded-2xl p-4 shadow-2xl flex flex-col gap-3"
    >
      <header className="flex items-start gap-2">
        <h3 className="m-0 text-sm font-semibold flex-1">Wie lief es mit diesem Agent?</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="px-2 rounded-md hover:bg-[var(--glass-bg)] cursor-pointer text-sm"
        >
          ✕
        </button>
      </header>

      {loading && (
        <div className="opacity-60 text-xs">Lade...</div>
      )}

      {!loading && eligibility && !eligibility.installed && (
        <p className="text-xs opacity-70 m-0" data-testid="rating-not-installed">
          Dieser Agent ist nicht installiert. Installiere ihn zuerst, um ihn bewerten zu können.
        </p>
      )}

      {!loading && eligibility?.installed && !eligibility.eligible && !eligibility.alreadyRated && (
        <p className="text-xs opacity-70 m-0" data-testid="rating-need-more-runs">
          Noch {Math.max(0, eligibility.executionsRequired - eligibility.executionCount)} Ausführung(en) bis zur Bewertung.
          Bisher {eligibility.executionCount}/{eligibility.executionsRequired}.
        </p>
      )}

      {!loading && eligibility?.installed && (eligibility.eligible || eligibility.alreadyRated) && !success && (
        <>
          <div
            className="flex gap-1"
            role="radiogroup"
            aria-label="Sterne-Bewertung"
            data-testid="rating-stars"
          >
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} Sterne`}
                data-testid={`rating-star-${star}`}
                onClick={() => setRating(star)}
                className={`text-2xl leading-none cursor-pointer ${star <= rating ? 'text-amber-500' : 'text-zinc-400 opacity-40'}`}
              >
                ★
              </button>
            ))}
          </div>

          <textarea
            value={review}
            onChange={e => setReview(e.target.value)}
            placeholder="Kurzes Feedback (optional)"
            maxLength={500}
            rows={2}
            data-testid="rating-review"
            className="w-full px-2 py-1.5 rounded-md text-inherit text-xs border border-[var(--glass-border)] bg-[var(--glass-bg)] resize-none"
          />

          {eligibility.alreadyRated && !eligibility.eligible && (
            <p className="text-[0.65rem] opacity-60 m-0">Du hast diesen Agent bereits bewertet — du kannst deine Bewertung aktualisieren.</p>
          )}

          {error && <div className="text-red-500 text-xs" role="alert">{error}</div>}

          <footer className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-[var(--glass-border)] bg-transparent text-xs cursor-pointer"
            >
              Später
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              data-testid="rating-submit"
              className="neuro-hover-lift px-3 py-1.5 rounded-md text-white text-xs border border-[var(--glass-border)] bg-[var(--accent-primary,#3b82f6)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '...' : eligibility.alreadyRated ? 'Aktualisieren' : 'Absenden'}
            </button>
          </footer>
        </>
      )}

      {success && (
        <p className="text-xs text-emerald-500 m-0" data-testid="rating-success">
          Danke für dein Feedback!
        </p>
      )}

      {!loading && !eligibility && error && (
        <div className="text-red-500 text-xs" role="alert">{error}</div>
      )}
    </div>
  );
}

/**
 * Given an installed blueprint id (`${originalId}_${8hex}`), return the original id.
 * Returns null if the id doesn't match the install pattern.
 */
export function parseOriginalBlueprintId(installedId: string): string | null {
  const match = installedId.match(/^(.+)_[0-9a-f]{8}$/);
  return match ? match[1] : null;
}
