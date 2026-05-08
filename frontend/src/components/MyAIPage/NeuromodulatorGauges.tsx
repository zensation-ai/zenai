/**
 * NeuromodulatorGauges - PMA neuromodulator tonic level visualization
 *
 * Phase 145: Shows 4 animated gauge bars for dopamine, norepinephrine,
 * serotonin, and acetylcholine with accessible German labels.
 */

import { type CSSProperties } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { useNeuromodulatorState } from '../../hooks/queries/usePMAData';

interface NeuromodulatorGaugesProps {
  context: AIContext;
}

const NEURO_CONFIG = [
  {
    key: 'dopamine' as const,
    label: 'Entdeckerfreude',
    colorFrom: '#8b5cf6',
    colorTo: '#c084fc',
  },
  {
    key: 'norepinephrine' as const,
    label: 'Lernbereitschaft',
    colorFrom: '#ef4444',
    colorTo: '#fca5a5',
  },
  {
    key: 'serotonin' as const,
    label: 'Konsolidierungsgeduld',
    colorFrom: '#22c55e',
    colorTo: '#86efac',
  },
  {
    key: 'acetylcholine' as const,
    label: 'Aufmerksamkeitsfokus',
    colorFrom: '#3b82f6',
    colorTo: '#93c5fd',
  },
] as const;

function getLevelLabel(value: number): string {
  if (value >= 0.8) return 'Sehr hoch';
  if (value >= 0.6) return 'Hoch';
  if (value >= 0.4) return 'Mittel';
  if (value >= 0.2) return 'Niedrig';
  return 'Sehr niedrig';
}

export function NeuromodulatorGauges({ context }: NeuromodulatorGaugesProps) {
  const { data, isLoading, isError, refetch } = useNeuromodulatorState(context);

  if (isLoading) {
    return (
      <div className="pma-neuro-section" role="status" aria-live="polite">
        <div className="cognitive-section-title">Neuromodulatoren</div>
        <div className="pma-neuro-loading">Lade Neuromodulator-Daten...</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="pma-neuro-section">
        <div className="cognitive-section-title">Neuromodulatoren</div>
        <div className="pma-neuro-error">
          <span>Neuromodulator-Daten nicht verfügbar.</span>
          <button className="cognitive-retry-btn" onClick={() => refetch()} type="button">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pma-neuro-section" role="region" aria-label="Neuromodulator-Pegel">
      <div className="cognitive-section-title">Neuromodulatoren</div>
      <div className="pma-neuro-grid">
        {NEURO_CONFIG.map(({ key, label, colorFrom, colorTo }) => {
          const value = data[key];
          const percent = Math.round(value * 100);

          return (
            <div key={key} className="pma-neuro-gauge">
              <div className="pma-neuro-header">
                <span className="pma-neuro-label">{label}</span>
                <span className="pma-neuro-value">{percent}%</span>
              </div>
              <div
                className="pma-neuro-track"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${percent}% — ${getLevelLabel(value)}`}
              >
                <div
                  className="pma-neuro-fill w-[var(--bar)] bg-[var(--bg)]"
                  style={{
                    '--bar': `${percent}%`,
                    '--bg': `linear-gradient(90deg, ${colorFrom}, ${colorTo})`,
                  } as CSSProperties}
                />
              </div>
              <span className="pma-neuro-level">{getLevelLabel(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
