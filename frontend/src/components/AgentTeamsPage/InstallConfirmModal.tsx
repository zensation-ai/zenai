/**
 * InstallConfirmModal — Permission-review + confirm step before installing
 * a marketplace blueprint.
 *
 * Shows the tool allowlist, daily action/token limits, and the approval-
 * required flag. Install button is disabled until the user confirms with
 * an explicit checkbox, so permissions cannot be granted by accident.
 *
 * Sprint 1.11
 */

import { useEffect, useState } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';
import type { BlueprintDetail } from './types';

interface Props {
  blueprintId: string;
  onClose: () => void;
  onInstalled: (newBlueprintId: string) => void;
  detailOverride?: BlueprintDetail; // for tests
}

export function InstallConfirmModal({ blueprintId, onClose, onInstalled, detailOverride }: Props) {
  const [detail, setDetail] = useState<BlueprintDetail | null>(detailOverride ?? null);
  const [loading, setLoading] = useState(!detailOverride);
  const [confirmed, setConfirmed] = useState(false);
  const [installing, setInstalling] = useState(false);
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
        logError('InstallConfirmModal:load', err);
        setError('Detail konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [blueprintId, detailOverride]);

  const handleInstall = async () => {
    if (!confirmed || installing) return;
    setInstalling(true);
    setError(null);
    try {
      const res = await axios.post('/api/marketplace/blueprints/install', { blueprintId });
      onInstalled(res.data?.data?.id ?? blueprintId);
    } catch (err) {
      logError('InstallConfirmModal:install', err);
      setError('Installation fehlgeschlagen.');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Installation bestätigen"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="liquid-glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        {loading && <div className="opacity-60 text-center p-8">Lade...</div>}
        {error && !loading && !detail && (
          <div className="text-red-500 text-sm">{error}</div>
        )}
        {detail && !loading && (
          <>
            <header className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden="true">{detail.icon}</span>
              <div className="flex-1 min-w-0">
                <h2 className="m-0 text-lg font-semibold">{detail.name} installieren</h2>
                <p className="text-xs opacity-60 m-0 mt-1">
                  Dieser Agent erhält Zugriff auf die unten aufgeführten Tools
                  und darf innerhalb der Limits autonom handeln.
                </p>
              </div>
            </header>

            <section
              aria-label="Tool-Berechtigungen"
              className="p-3 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]"
            >
              <h3 className="m-0 mb-2 text-xs font-semibold opacity-80">
                Tool-Berechtigungen ({detail.tools.length})
              </h3>
              {detail.tools.length === 0 ? (
                <p className="text-xs opacity-60 m-0">Keine externen Tools angefordert.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 list-none p-0 m-0">
                  {detail.tools.map(tool => (
                    <li
                      key={tool}
                      data-testid={`perm-tool-${tool}`}
                      className="text-[0.7rem] px-2 py-1 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                    >
                      {tool}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-label="Tägliche Limits"
              className="grid grid-cols-3 gap-2 text-xs"
            >
              <div className="p-2 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <div className="opacity-60 text-[0.65rem]">Max. Aktionen/Tag</div>
                <div className="font-semibold">{detail.maxActionsPerDay}</div>
              </div>
              <div className="p-2 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <div className="opacity-60 text-[0.65rem]">Token-Budget/Tag</div>
                <div className="font-semibold">{detail.tokenBudgetDaily.toLocaleString('de-DE')}</div>
              </div>
              <div className="p-2 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                <div className="opacity-60 text-[0.65rem]">Freigabe nötig</div>
                <div className="font-semibold">{detail.approvalRequired ? 'Ja' : 'Nein'}</div>
              </div>
            </section>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                data-testid="install-confirm-checkbox"
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed">
                Ich verstehe, dass dieser Agent die oben aufgeführten Tools
                in meinem Namen nutzen darf.
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
                onClick={handleInstall}
                disabled={!confirmed || installing}
                data-testid="install-confirm-submit"
                className="neuro-hover-lift px-4 py-2 rounded-md text-white border border-[var(--glass-border)] bg-[var(--accent-primary,#3b82f6)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {installing ? 'Installiere...' : 'Zustimmen & Installieren'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
