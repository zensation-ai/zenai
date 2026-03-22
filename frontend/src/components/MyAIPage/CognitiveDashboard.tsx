/**
 * CognitiveDashboard - KI-Bewusstsein Tab Container
 *
 * Phase 141: Sub-tabbed container with 5 sections:
 * Overview, Curiosity, Predictions, Memory/FSRS, Improvement
 *
 * Lazy-loads sub-components with Suspense.
 */

import { useState, Suspense, lazy } from 'react';
import type { AIContext } from '../ContextSwitcher';
import './CognitiveDashboard.css';

// Lazy-loaded sub-components
const CognitiveOverview = lazy(() =>
  import('./CognitiveOverview').then(m => ({ default: m.CognitiveOverview }))
);
const CuriosityPanel = lazy(() =>
  import('./CuriosityPanel').then(m => ({ default: m.CuriosityPanel }))
);
const PredictionPanel = lazy(() =>
  import('./PredictionPanel').then(m => ({ default: m.PredictionPanel }))
);
const ReviewQueuePanel = lazy(() =>
  import('./ReviewQueuePanel').then(m => ({ default: m.ReviewQueuePanel }))
);
const ImprovementPanel = lazy(() =>
  import('./ImprovementPanel').then(m => ({ default: m.ImprovementPanel }))
);

interface CognitiveDashboardProps {
  context: AIContext;
}

type CognitiveSection = 'overview' | 'curiosity' | 'predictions' | 'memory' | 'improvement';

const SECTIONS: { id: CognitiveSection; label: string; icon: string }[] = [
  { id: 'overview', label: 'Uebersicht', icon: '\u{1F4CA}' },
  { id: 'curiosity', label: 'Neugier', icon: '\u{1F50D}' },
  { id: 'predictions', label: 'Vorhersagen', icon: '\u{1F52E}' },
  { id: 'memory', label: 'Gedaechtnis', icon: '\u{1F9E0}' },
  { id: 'improvement', label: 'Verbesserung', icon: '\u{1F4C8}' },
];

function SectionFallback() {
  return (
    <div className="cognitive-loading" role="status" aria-live="polite">
      <span aria-hidden="true">{'\u{1F9E0}'}</span>
      Lade...
    </div>
  );
}

export function CognitiveDashboard({ context }: CognitiveDashboardProps) {
  const [active, setActive] = useState<CognitiveSection>('overview');

  return (
    <div className="cognitive-dashboard" role="main" aria-label="KI-Bewusstsein Dashboard">
      {/* Pill navigation */}
      <div className="cognitive-pills" role="tablist" aria-label="Kognitive Bereiche">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={active === s.id}
            className={`cognitive-pill ${active === s.id ? 'active' : ''}`}
            onClick={() => setActive(s.id)}
            type="button"
          >
            <span aria-hidden="true">{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Suspense fallback={<SectionFallback />}>
        {active === 'overview' && <CognitiveOverview context={context} />}
        {active === 'curiosity' && <CuriosityPanel context={context} />}
        {active === 'predictions' && <PredictionPanel context={context} />}
        {active === 'memory' && <ReviewQueuePanel context={context} />}
        {active === 'improvement' && <ImprovementPanel context={context} />}
      </Suspense>
    </div>
  );
}
