/**
 * MemoryHealthPMA - Triple-copy memory strength visualization
 *
 * Phase 145: Shows Fast/Medium/Deep strength bars for recent memories.
 * Highlights STC (Synaptic Tag & Capture) rescue events.
 */

import { type CSSProperties } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { useMemoryHealth, type MemoryHealthEntry } from '../../hooks/queries/usePMAData';

interface MemoryHealthPMAProps {
  context: AIContext;
}

const STRENGTH_CONFIG = [
  { key: 'fastStrength' as const, label: 'Schnell', color: '#3b82f6' },
  { key: 'mediumStrength' as const, label: 'Mittel', color: '#f59e0b' },
  { key: 'deepStrength' as const, label: 'Tief', color: '#22c55e' },
] as const;

function formatRescueDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

function MemoryEntry({ entry }: { entry: MemoryHealthEntry }) {
  return (
    <div className="pma-health-entry">
      <div className="pma-health-content">
        <span className="pma-health-text" title={entry.content}>
          {truncate(entry.content, 80)}
        </span>
        {entry.lastRescue && (
          <span className="pma-health-rescue-badge" title={`STC-Rettung am ${formatRescueDate(entry.lastRescue)}`}>
            STC {formatRescueDate(entry.lastRescue)}
          </span>
        )}
      </div>
      <div className="pma-health-bars">
        {STRENGTH_CONFIG.map(({ key, label, color }) => {
          const value = entry[key];
          const percent = Math.round(value * 100);
          return (
            <div key={key} className="pma-health-bar-row">
              <span className="pma-health-bar-label">{label}</span>
              <div
                className="pma-health-bar-track"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${percent}%`}
              >
                <div
                  className="pma-health-bar-fill w-[var(--bar)] bg-[var(--bg)]"
                  style={{ '--bar': `${percent}%`, '--bg': color } as CSSProperties}
                />
              </div>
              <span className="pma-health-bar-value">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MemoryHealthPMA({ context }: MemoryHealthPMAProps) {
  const { data, isLoading, isError, refetch } = useMemoryHealth(context);

  if (isLoading) {
    return (
      <div className="pma-health-section" role="status" aria-live="polite">
        <div className="cognitive-section-title">Gedächtnisgesundheit (PMA)</div>
        <div className="pma-health-loading">Lade Gedächtnis-Daten...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pma-health-section">
        <div className="cognitive-section-title">Gedächtnisgesundheit (PMA)</div>
        <div className="pma-health-error">
          <span>Gedächtnis-Daten nicht verfügbar.</span>
          <button className="cognitive-retry-btn" onClick={() => refetch()} type="button">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="pma-health-section">
        <div className="cognitive-section-title">Gedächtnisgesundheit (PMA)</div>
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{1F9E0}'}</div>
          <div>Noch keine Erinnerungen zum Anzeigen</div>
        </div>
      </div>
    );
  }

  const rescueCount = data.filter(e => e.lastRescue).length;

  return (
    <div className="pma-health-section" role="region" aria-label="Gedächtnisgesundheit">
      <div className="pma-health-header">
        <div className="cognitive-section-title">Gedächtnisgesundheit (PMA)</div>
        {rescueCount > 0 && (
          <span className="pma-health-rescue-count" title="Durch STC gerettete Erinnerungen">
            {rescueCount} STC-Rettung{rescueCount !== 1 ? 'en' : ''}
          </span>
        )}
      </div>
      <div className="pma-health-legend">
        {STRENGTH_CONFIG.map(({ label, color }) => (
          <span key={label} className="pma-health-legend-item">
            <span className="pma-health-legend-dot bg-[var(--bg)]" style={{ '--bg': color } as CSSProperties} />
            {label}
          </span>
        ))}
      </div>
      <div className="pma-health-list">
        {data.slice(0, 10).map(entry => (
          <MemoryEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
