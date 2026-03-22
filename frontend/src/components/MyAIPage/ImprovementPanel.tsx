/**
 * ImprovementPanel - Verbesserung tab for KI-Bewusstsein
 *
 * Phase 141: Self-improvement budget, opportunities,
 * adaptive preferences, and feedback summary
 */

import type { AIContext } from '../ContextSwitcher';
import {
  useSelfImprovementOpportunities,
  useSelfImprovementBudget,
  useAdaptivePreferences,
  useFeedbackSummary,
  type AdaptivePreferences,
  type FeedbackSummaryEntry,
} from '../../hooks/queries/useCognitiveData';

interface ImprovementPanelProps {
  context: AIContext;
}

const RISK_LABELS: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
};

const TYPE_LABELS: Record<string, string> = {
  knowledge_gap_research: 'Wissensluecken-Recherche',
  procedural_optimization: 'Prozedurale Optimierung',
  team_learning: 'Team-Lernen',
  calibration_fix: 'Kalibrierungskorrektur',
};

const RESPONSE_LENGTH_LABELS: Record<string, string> = {
  brief: 'Kurz',
  moderate: 'Mittel',
  detailed: 'Ausfuehrlich',
};

const DETAIL_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Einsteiger',
  intermediate: 'Fortgeschritten',
  expert: 'Experte',
};

const PROACTIVITY_LABELS: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
};

const STYLE_LABELS: Record<string, string> = {
  formal: 'Formal',
  casual: 'Locker',
};

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  response_rating: 'Antwortbewertung',
  fact_correction: 'Faktenkorrektur',
  suggestion_action: 'Vorschlags-Aktion',
  tool_success: 'Tool-Erfolg',
  document_quality: 'Dokumentqualitaet',
  agent_performance: 'Agenten-Leistung',
};

function BudgetMeter({ context }: { context: AIContext }) {
  const { data, isLoading } = useSelfImprovementBudget(context);

  if (isLoading || !data) return null;

  const usedPercent = data.maxActionsPerDay > 0
    ? Math.round((data.usedToday / data.maxActionsPerDay) * 100)
    : 0;

  return (
    <div className="cognitive-progress-section" role="region" aria-label="Verbesserungsbudget">
      <div className="cognitive-section-title">Tagesbudget</div>
      <div className="improvement-budget">
        <span className="cognitive-progress-label">
          {data.usedToday} von {data.maxActionsPerDay} Verbesserungen heute
        </span>
        <span className="cognitive-progress-value">
          {data.remainingToday} verbleibend
        </span>
      </div>
      <div className="budget-bar" role="progressbar" aria-valuenow={data.usedToday} aria-valuemin={0} aria-valuemax={data.maxActionsPerDay} aria-label="Verbesserungsbudget">
        <div className="budget-fill" style={{ width: `${usedPercent}%` }} />
      </div>
    </div>
  );
}

function OpportunitiesSection({ context }: { context: AIContext }) {
  const opportunities = useSelfImprovementOpportunities(context);
  const budget = useSelfImprovementBudget(context);

  if (opportunities.isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        Lade Verbesserungsmoeglichkeiten...
      </div>
    );
  }

  const items = opportunities.data ?? [];
  const budgetExhausted = (budget.data?.remainingToday ?? 0) <= 0;

  return (
    <div className="cognitive-list-card" role="region" aria-label="Verbesserungsmoeglichkeiten">
      <div className="cognitive-section-title">Verbesserungsmoeglichkeiten</div>
      {items.length === 0 ? (
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{2705}'}</div>
          <div>Keine Verbesserungen vorgeschlagen</div>
        </div>
      ) : (
        <div className="cognitive-list-items">
          {items.map(opp => (
            <div key={opp.id} className="cognitive-gap-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="cognitive-gap-area">
                  {TYPE_LABELS[opp.type] ?? opp.type}
                </span>
                <span className={`risk-badge ${opp.riskLevel}`}>
                  {RISK_LABELS[opp.riskLevel] ?? opp.riskLevel}
                </span>
              </div>
              <span className="cognitive-gap-description" style={{ marginTop: 4 }}>
                {opp.description}
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div className="cognitive-progress-bar" style={{ flex: 1, marginRight: 12 }} role="progressbar" aria-valuenow={Math.round(opp.estimatedImpact * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Geschaetzter Impact">
                  <div
                    className="cognitive-progress-fill high"
                    style={{ width: `${Math.round(opp.estimatedImpact * 100)}%` }}
                  />
                </div>
                <button
                  className="cognitive-retry-btn"
                  disabled={budgetExhausted || opp.requiresApproval}
                  type="button"
                  title={opp.requiresApproval ? 'Erfordert Genehmigung' : budgetExhausted ? 'Budget aufgebraucht' : 'Ausfuehren'}
                >
                  {opp.requiresApproval ? 'Genehmigung noetig' : 'Ausfuehren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreferencesSection({ prefs }: { prefs: AdaptivePreferences | null | undefined }) {
  if (!prefs) return null;

  const items = [
    { label: 'Antwortlaenge', value: RESPONSE_LENGTH_LABELS[prefs.responseLength] ?? prefs.responseLength },
    { label: 'Detailgrad', value: DETAIL_LEVEL_LABELS[prefs.detailLevel] ?? prefs.detailLevel },
    { label: 'Proaktivitaet', value: PROACTIVITY_LABELS[prefs.proactivityLevel] ?? prefs.proactivityLevel },
    { label: 'Sprachstil', value: STYLE_LABELS[prefs.languageStyle] ?? prefs.languageStyle },
  ];

  return (
    <div className="cognitive-list-card" role="region" aria-label="Gelernte Praeferenzen">
      <div className="cognitive-section-title">Gelernte Praeferenzen</div>
      <div className="preferences-grid">
        {items.map(item => (
          <div key={item.label} className="preference-item">
            <div className="preference-label">{item.label}</div>
            <div className="preference-value">{item.value}</div>
          </div>
        ))}
        {prefs.preferredTools.length > 0 && (
          <div className="preference-item" style={{ gridColumn: '1 / -1' }}>
            <div className="preference-label">Bevorzugte Tools</div>
            <div className="preference-value">
              {prefs.preferredTools.join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackSection({ entries }: { entries: FeedbackSummaryEntry[] | undefined }) {
  const items = entries ?? [];

  if (items.length === 0) return null;

  return (
    <div className="cognitive-list-card" role="region" aria-label="Feedback-Zusammenfassung">
      <div className="cognitive-section-title">Feedback-Zusammenfassung</div>
      <div className="cognitive-list-items">
        {items.map(entry => (
          <div key={entry.type} className="cognitive-prediction-item">
            <span className="cognitive-prediction-text">
              {FEEDBACK_TYPE_LABELS[entry.type] ?? entry.type}
            </span>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <span className="gap-action-badge" title="Durchschnittswert">
                {entry.avgValue.toFixed(1)}
              </span>
              <span className="gap-action-badge" title="Positivrate">
                {Math.round(entry.positiveRate * 100)}%
              </span>
              <span className="gap-action-badge" title={`Anzahl: ${entry.totalCount}`}>
                n={entry.totalCount}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImprovementPanel({ context }: ImprovementPanelProps) {
  const prefs = useAdaptivePreferences(context);
  const feedback = useFeedbackSummary(context);

  return (
    <div className="cognitive-dashboard" role="region" aria-label="Selbstverbesserung">
      <BudgetMeter context={context} />
      <OpportunitiesSection context={context} />
      <PreferencesSection prefs={prefs.data} />
      <FeedbackSection entries={feedback.data} />
    </div>
  );
}
