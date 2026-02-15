import type { TriageAction } from './InboxTriage';

interface TriageActionsProps {
  recommendedAction: TriageAction;
  isAnimating: boolean;
  onAction: (action: TriageAction) => void;
}

export function TriageActions({ recommendedAction, isAnimating, onAction }: TriageActionsProps) {
  return (
    <div className="triage-quick-actions neuro-flow-list" role="group" aria-label="Schnelle Aktionen">
      <button
        className={'triage-action-btn later neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'later' ? 'neuro-pulse-interactive' : '')}
        onClick={() => onAction('later')}
        disabled={isAnimating}
        title="Auf später verschieben"
        aria-label="Gedanke auf später verschieben"
      >
        <span className="action-icon" aria-hidden="true">⏰</span>
        <span className="action-label">Später</span>
      </button>
      <button
        className={'triage-action-btn archive neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'archive' ? 'neuro-pulse-interactive' : '')}
        onClick={() => onAction('archive')}
        disabled={isAnimating}
        title="Archivieren"
        aria-label="Gedanke archivieren"
      >
        <span className="action-icon" aria-hidden="true">📥</span>
        <span className="action-label">Archiv</span>
      </button>
      <button
        className={'triage-action-btn keep neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'keep' ? 'neuro-pulse-interactive' : '')}
        onClick={() => onAction('keep')}
        disabled={isAnimating}
        title="Behalten wie es ist"
        aria-label="Gedanke behalten"
      >
        <span className="action-icon" aria-hidden="true">✓</span>
        <span className="action-label">Behalten</span>
      </button>
      <button
        className={'triage-action-btn priority neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'priority' ? 'neuro-button-glow' : '')}
        onClick={() => onAction('priority')}
        disabled={isAnimating}
        title="Als Priorität markieren"
        aria-label="Gedanke als Priorität markieren"
        style={{ position: 'relative' }}
      >
        <span className="action-icon" aria-hidden="true">🔥</span>
        <span className="action-label">Priorität</span>
        {recommendedAction === 'priority' && (
          <span className="neuro-suggested-action" style={{ position: 'absolute', top: '-8px', right: '-8px', fontSize: '0.65rem', padding: '2px 6px' }}>
            Empfohlen
          </span>
        )}
      </button>
    </div>
  );
}
