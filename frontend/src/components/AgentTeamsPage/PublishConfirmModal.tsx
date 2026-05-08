/**
 * PublishConfirmModal — Tool-sharing review + confirm step before publishing
 * a user blueprint to the community marketplace.
 *
 * Shows the tool allowlist so the owner sees exactly what other users will
 * be asked to approve at install-time. Description, category, and tags are
 * editable and default to the stored blueprint values.
 *
 * Sprint 1.12
 */

import { useEffect, useMemo, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { logError } from '../../utils/errors';
import type { PublishCandidate } from './types';

interface Props {
  blueprintId: string;
  onClose: () => void;
  onPublished: () => void;
  candidateOverride?: PublishCandidate;
}

const CATEGORY_OPTIONS = [
  'productivity',
  'research',
  'writing',
  'development',
  'communication',
  'analysis',
  'custom',
];

const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 500;
const TAG_MAX = 5;

export function PublishConfirmModal({ blueprintId, onClose, onPublished, candidateOverride }: Props) {
  const [candidate, setCandidate] = useState<PublishCandidate | null>(candidateOverride ?? null);
  const [loading, setLoading] = useState(!candidateOverride);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (candidateOverride) {
      setDescription(candidateOverride.description ?? '');
      setCategory(candidateOverride.category ?? 'custom');
      setTagsInput((candidateOverride.tags ?? []).join(', '));
      return;
    }
    let cancelled = false;
    setLoading(true);
    axios
      .get(`/api/marketplace/blueprints/${blueprintId}/publish-candidate`)
      .then(res => {
        if (cancelled) return;
        const data = res.data?.data as PublishCandidate | undefined;
        if (!data) {
          setError('Agent konnte nicht geladen werden.');
          return;
        }
        setCandidate(data);
        setDescription(data.description ?? '');
        setCategory(data.category ?? 'custom');
        setTagsInput((data.tags ?? []).join(', '));
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        logError('PublishConfirmModal:load', err);
        setError('Agent konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blueprintId, candidateOverride]);

  const parsedTags = useMemo(
    () =>
      tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .slice(0, TAG_MAX),
    [tagsInput],
  );

  const descriptionLen = description.trim().length;
  const descriptionValid =
    descriptionLen === 0 || (descriptionLen >= DESCRIPTION_MIN && descriptionLen <= DESCRIPTION_MAX);

  const canSubmit = confirmed && !submitting && descriptionValid && parsedTags.length <= TAG_MAX;

  const handlePublish = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await axios.post('/api/marketplace/blueprints/publish', {
        blueprintId,
        description: descriptionLen >= DESCRIPTION_MIN ? description.trim() : undefined,
        category,
        tags: parsedTags,
      });
      onPublished();
    } catch (err) {
      logError('PublishConfirmModal:publish', err);
      const ax = err as AxiosError<{ error?: string; reason?: string }>;
      const status = ax?.response?.status ?? 0;
      if (status === 422) {
        setError(
          ax.response?.data?.reason
            ? `Inhalt wurde moderationsseitig blockiert: ${ax.response.data.reason}`
            : 'Inhalt wurde moderationsseitig blockiert.',
        );
      } else if (status === 429) {
        setError('Veröffentlichungs-Limit erreicht (max. 3 pro Tag). Bitte später erneut versuchen.');
      } else if (status === 409) {
        setError('Ein ähnlicher Agent wurde kürzlich bereits veröffentlicht.');
      } else if (ax?.response?.data?.error) {
        setError(ax.response.data.error);
      } else {
        setError('Veröffentlichung fehlgeschlagen.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agent veröffentlichen"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="liquid-glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        {loading && <div className="opacity-60 text-center p-8">Lade...</div>}
        {error && !loading && !candidate && (
          <div className="text-red-500 text-sm" role="alert">{error}</div>
        )}
        {candidate && !loading && (
          <>
            <header className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden="true">{candidate.icon}</span>
              <div className="flex-1 min-w-0">
                <h2 className="m-0 text-lg font-semibold">{candidate.name} veröffentlichen</h2>
                <p className="text-xs opacity-60 m-0 mt-1">
                  Nach Freigabe durch die Moderation ist der Agent für andere
                  Nutzer:innen installierbar. Die unten gezeigten Tools werden
                  bei der Installation als Berechtigungsliste angezeigt.
                </p>
              </div>
            </header>

            <section
              aria-label="Tool-Weitergabe"
              className="p-3 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]"
            >
              <h3 className="m-0 mb-2 text-xs font-semibold opacity-80">
                Tools, die andere sehen ({candidate.tools.length})
              </h3>
              {candidate.tools.length === 0 ? (
                <p className="text-xs opacity-60 m-0">Keine externen Tools.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 list-none p-0 m-0">
                  {candidate.tools.map(tool => (
                    <li
                      key={tool}
                      data-testid={`publish-tool-${tool}`}
                      className="text-[0.7rem] px-2 py-1 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                    >
                      {tool}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-80">
                Beschreibung ({descriptionLen}/{DESCRIPTION_MAX}, min. {DESCRIPTION_MIN})
              </span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={DESCRIPTION_MAX}
                rows={4}
                placeholder="Was macht dieser Agent? Für wen ist er?"
                data-testid="publish-description"
                className="p-2 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-inherit resize-y"
              />
              {!descriptionValid && (
                <span className="text-red-500">
                  Beschreibung muss zwischen {DESCRIPTION_MIN} und {DESCRIPTION_MAX} Zeichen liegen.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-80">Kategorie</span>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                data-testid="publish-category"
                className="p-2 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-inherit"
              >
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-80">
                Tags (max. {TAG_MAX}, Komma-getrennt)
              </span>
              <input
                type="text"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="z.B. research, writing, daily"
                data-testid="publish-tags"
                className="p-2 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-inherit"
              />
              {parsedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {parsedTags.map(tag => (
                    <span
                      key={tag}
                      className="text-[0.65rem] px-1.5 py-0.5 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </label>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                data-testid="publish-confirm-checkbox"
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed">
                Ich habe die Tool-Liste überprüft und möchte diesen Agent
                öffentlich teilen. Die Veröffentlichung wird zunächst von
                der Moderation geprüft.
              </span>
            </label>

            {error && (
              <div className="text-red-500 text-sm" role="alert">{error}</div>
            )}

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
                onClick={handlePublish}
                disabled={!canSubmit}
                data-testid="publish-confirm-submit"
                className="neuro-hover-lift px-4 py-2 rounded-md text-white border border-[var(--glass-border)] bg-[var(--accent-primary,#3b82f6)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sende...' : 'Zustimmen & Veröffentlichen'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
