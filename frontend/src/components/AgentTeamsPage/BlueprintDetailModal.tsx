/**
 * BlueprintDetailModal — Marketplace agent detail view.
 *
 * Shows tool-allowlist preview, instructions as sample prompt, rating histogram,
 * and recent reviews. Install CTA delegates to the parent (install flow
 * with permission review lives in MarketplaceTab).
 *
 * Sprint 1.11
 */

import { useEffect, useState } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';
import type { BlueprintDetail, RatingHistogram } from './types';

interface Props {
  blueprintId: string;
  onClose: () => void;
  onInstall?: (detail: BlueprintDetail) => void;
  detailOverride?: BlueprintDetail; // for tests
}

export function BlueprintDetailModal({ blueprintId, onClose, onInstall, detailOverride }: Props) {
  const [detail, setDetail] = useState<BlueprintDetail | null>(detailOverride ?? null);
  const [loading, setLoading] = useState(!detailOverride);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detailOverride) return;
    let cancelled = false;
    setLoading(true);
    axios
      .get(`/api/marketplace/blueprints/${blueprintId}`)
      .then(res => {
        if (cancelled) return;
        setDetail(res.data?.data ?? null);
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        logError('BlueprintDetailModal:load', err);
        setError('Detail konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [blueprintId, detailOverride]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agent-Detail"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="liquid-glass rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        {loading && <div className="opacity-60 text-center p-8">Lade Detail...</div>}
        {error && !loading && (
          <div className="text-red-500 text-sm">{error}</div>
        )}
        {detail && !loading && (
          <>
            <header className="flex items-start gap-3">
              <span className="text-4xl" aria-hidden="true">{detail.icon}</span>
              <div className="flex-1 min-w-0">
                <h2 className="m-0 text-xl font-semibold">{detail.name}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs opacity-60">{detail.category}</span>
                  {detail.featured && (
                    <span className="text-[0.65rem] px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                      ★ Empfohlen
                    </span>
                  )}
                  {detail.histogram.average != null && (
                    <span className="text-xs text-amber-500">
                      {detail.histogram.average.toFixed(2)} ({detail.histogram.total})
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                className="px-2 py-1 rounded-md hover:bg-[var(--glass-bg)] cursor-pointer"
              >
                ✕
              </button>
            </header>

            {detail.description && (
              <p className="text-sm opacity-80 leading-relaxed m-0">{detail.description}</p>
            )}

            <section aria-label="Tool-Zugriff">
              <h3 className="m-0 mb-2 text-sm font-semibold">Tool-Zugriff ({detail.tools.length})</h3>
              {detail.tools.length === 0 ? (
                <p className="text-xs opacity-60 m-0">Keine externen Tools.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 list-none p-0 m-0">
                  {detail.tools.map(tool => (
                    <li
                      key={tool}
                      className="text-[0.7rem] px-2 py-1 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                    >
                      {tool}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.instructions && (
              <section aria-label="Beispiel-Prompt">
                <h3 className="m-0 mb-2 text-sm font-semibold">Beispiel-Prompt</h3>
                <pre className="text-xs opacity-80 leading-relaxed p-3 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] whitespace-pre-wrap m-0 max-h-32 overflow-auto">
                  {detail.instructions}
                </pre>
              </section>
            )}

            <RatingHistogramBars histogram={detail.histogram} />

            {detail.recentReviews.length > 0 && (
              <section aria-label="Bewertungen">
                <h3 className="m-0 mb-2 text-sm font-semibold">Letzte Bewertungen</h3>
                <ul className="flex flex-col gap-2 list-none p-0 m-0">
                  {detail.recentReviews.map(r => (
                    <li
                      key={r.id}
                      className="p-2 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs"
                    >
                      <div className="text-amber-500">{'★'.repeat(r.rating)}<span className="opacity-30">{'★'.repeat(5 - r.rating)}</span></div>
                      {r.review && <div className="mt-1 opacity-80">{r.review}</div>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {onInstall && (
              <footer className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-md border border-[var(--glass-border)] bg-transparent text-inherit cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => onInstall(detail)}
                  className="neuro-hover-lift px-4 py-2 rounded-md text-white border border-[var(--glass-border)] bg-[var(--accent-primary,#3b82f6)] cursor-pointer"
                >
                  Installieren
                </button>
              </footer>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RatingHistogramBars({ histogram }: { histogram: RatingHistogram }) {
  if (histogram.total === 0) return (
    <section aria-label="Bewertungsverteilung">
      <h3 className="m-0 mb-2 text-sm font-semibold">Bewertungsverteilung</h3>
      <p className="text-xs opacity-60 m-0">Noch keine Bewertungen.</p>
    </section>
  );

  return (
    <section aria-label="Bewertungsverteilung">
      <h3 className="m-0 mb-2 text-sm font-semibold">Bewertungsverteilung ({histogram.total})</h3>
      <ul className="flex flex-col gap-1 list-none p-0 m-0">
        {([5, 4, 3, 2, 1] as const).map(star => {
          const count = histogram.distribution[star];
          const pct = histogram.total > 0 ? Math.round((count / histogram.total) * 100) : 0;
          return (
            <li
              key={star}
              className="flex items-center gap-2 text-xs"
              data-testid={`histogram-bar-${star}`}
            >
              <span className="w-4 text-amber-500">{star}★</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--glass-bg)] overflow-hidden">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right opacity-60">{count}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
