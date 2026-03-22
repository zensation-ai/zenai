/**
 * CuriosityPanel - Neugier tab for KI-Bewusstsein
 *
 * Phase 141: Knowledge Gaps, Hypotheses, Information Gain
 */

import type { AIContext } from '../ContextSwitcher';
import {
  useCuriosityGaps,
  useCuriosityHypotheses,
  useInformationGain,
  useUpdateHypothesisStatus,
  type KnowledgeGapDetail,
  type HypothesisEntry,
  type InformationGainEntry,
} from '../../hooks/queries/useCognitiveData';

interface CuriosityPanelProps {
  context: AIContext;
}

const ACTION_LABELS: Record<string, string> = {
  web_research: 'Recherchieren',
  consolidate_existing: 'Konsolidieren',
  ask_user: 'Fragen',
  monitor: 'Beobachten',
};

const SOURCE_LABELS: Record<string, string> = {
  incomplete_pattern: 'Muster',
  temporal_gap: 'Zeitluecke',
  contradiction: 'Widerspruch',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Offen',
  confirmed: 'Bestaetigt',
  refuted: 'Widerlegt',
};

function getGapSeverity(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function GapsSection({ gaps, isLoading }: { gaps: KnowledgeGapDetail[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        Lade Wissensluecken...
      </div>
    );
  }

  const items = gaps ?? [];

  return (
    <div className="cognitive-list-card" role="region" aria-label="Wissensluecken">
      <div className="cognitive-section-title">Wissensluecken</div>
      {items.length === 0 ? (
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{2705}'}</div>
          <div>Keine Wissensluecken erkannt</div>
        </div>
      ) : (
        <div className="cognitive-list-items">
          {items.map((gap, i) => {
            const severity = getGapSeverity(gap.gapScore);
            return (
              <div key={`${gap.topic}-${i}`} className="cognitive-gap-item">
                <span
                  className={`cognitive-gap-severity ${severity}`}
                  title={severity === 'high' ? 'Hoch' : severity === 'medium' ? 'Mittel' : 'Niedrig'}
                />
                <div className="cognitive-gap-content" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="cognitive-gap-area">{gap.topic}</span>
                    <span className="gap-action-badge">
                      {ACTION_LABELS[gap.suggestedAction] ?? gap.suggestedAction}
                    </span>
                  </div>
                  <span className="cognitive-gap-description">
                    {gap.domain} &middot; {gap.queryCount} Anfragen &middot; {gap.factCount} Fakten
                  </span>
                  <div className="cognitive-progress-bar" style={{ marginTop: 6 }} role="progressbar" aria-valuenow={Math.round(gap.gapScore * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Gap Score fuer ${gap.topic}`}>
                    <div
                      className={`cognitive-progress-fill ${severity}`}
                      style={{ width: `${Math.round(gap.gapScore * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HypothesesSection({
  hypotheses,
  isLoading,
  onUpdateStatus,
}: {
  hypotheses: HypothesisEntry[] | undefined;
  isLoading: boolean;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        Lade Hypothesen...
      </div>
    );
  }

  const items = hypotheses ?? [];

  return (
    <div className="cognitive-list-card" role="region" aria-label="Hypothesen">
      <div className="cognitive-section-title">Hypothesen</div>
      {items.length === 0 ? (
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{1F4A1}'}</div>
          <div>Noch keine Hypothesen generiert</div>
        </div>
      ) : (
        <div className="cognitive-list-items">
          {items.map(h => (
            <div key={h.id} className="cognitive-gap-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span className="cognitive-gap-area" style={{ flex: 1 }}>{h.hypothesis}</span>
                <span className={`cognitive-prediction-badge ${h.status}`}>
                  {STATUS_LABELS[h.status] ?? h.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span className="cognitive-gap-description">
                  {SOURCE_LABELS[h.sourceType] ?? h.sourceType} &middot; Konfidenz: {Math.round(h.confidence * 100)}%
                </span>
                {h.status === 'pending' && (
                  <div className="hypothesis-actions">
                    <button
                      className="hypothesis-btn confirm"
                      onClick={() => onUpdateStatus(h.id, 'confirmed')}
                      type="button"
                    >
                      Bestaetigen
                    </button>
                    <button
                      className="hypothesis-btn refute"
                      onClick={() => onUpdateStatus(h.id, 'refuted')}
                      type="button"
                    >
                      Widerlegen
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InformationGainSection({ entries, isLoading }: { entries: InformationGainEntry[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        Lade Informationsgewinn...
      </div>
    );
  }

  const items = (entries ?? []).slice(0, 10);

  return (
    <div className="cognitive-list-card" role="region" aria-label="Informationsgewinn">
      <div className="cognitive-section-title">Informationsgewinn (letzte 10)</div>
      {items.length === 0 ? (
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{1F4CA}'}</div>
          <div>Noch keine Informationsgewinn-Daten</div>
        </div>
      ) : (
        <div className="cognitive-list-items">
          {items.map((entry, i) => (
            <div key={`${entry.queryText}-${i}`} className="cognitive-prediction-item">
              <span className="cognitive-prediction-text" title={entry.queryText}>
                {entry.queryText}
              </span>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <span className="gap-action-badge" title="Ueberraschung">
                  S: {entry.surprise.toFixed(2)}
                </span>
                <span className="gap-action-badge" title="Neuheit">
                  N: {entry.novelty.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CuriosityPanel({ context }: CuriosityPanelProps) {
  const gaps = useCuriosityGaps(context);
  const hypotheses = useCuriosityHypotheses(context);
  const infoGain = useInformationGain(context);
  const updateStatus = useUpdateHypothesisStatus(context);

  const handleUpdateStatus = (id: string, status: string) => {
    updateStatus.mutate({ id, status });
  };

  return (
    <div className="cognitive-dashboard" role="region" aria-label="Neugier-Engine">
      <GapsSection gaps={gaps.data} isLoading={gaps.isLoading} />
      <HypothesesSection
        hypotheses={hypotheses.data}
        isLoading={hypotheses.isLoading}
        onUpdateStatus={handleUpdateStatus}
      />
      <InformationGainSection entries={infoGain.data} isLoading={infoGain.isLoading} />
    </div>
  );
}
