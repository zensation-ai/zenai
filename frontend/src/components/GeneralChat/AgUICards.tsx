/**
 * AG-UI Card Renderers
 *
 * Renders AG-UI custom event cards (hypothesis, approval, insight)
 * and pipeline status within the chat interface.
 *
 * @module components/GeneralChat/AgUICards
 */

import type { AgUICard } from '../../hooks/useAgUIState';
import { cn } from '@/lib/utils';

interface AgUICardsProps {
  cards: AgUICard[];
  pipelineStatus: Record<string, unknown> | null;
  onDismiss?: (cardId: string) => void;
}

export function AgUICards({ cards, pipelineStatus, onDismiss }: AgUICardsProps) {
  if (cards.length === 0 && !pipelineStatus) return null;

  return (
    <div className="flex flex-col gap-2 my-2">
      {pipelineStatus && <PipelineCard status={pipelineStatus} />}
      {cards.map(card => (
        <AgUICardRenderer key={card.id} card={card} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function AgUICardRenderer({ card, onDismiss }: { card: AgUICard; onDismiss?: (id: string) => void }) {
  switch (card.type) {
    case 'hypothesis_card':
      return <HypothesisCard card={card} onDismiss={onDismiss} />;
    case 'approval_request':
      return <ApprovalCard card={card} onDismiss={onDismiss} />;
    case 'cognitive_insight':
      return <InsightCard card={card} onDismiss={onDismiss} />;
    case 'fsrs_review':
      return <ReviewCard card={card} onDismiss={onDismiss} />;
    case 'predicted_intent':
      return <PredictionCard card={card} onDismiss={onDismiss} />;
    default:
      return null;
  }
}

const CARD_BASE = 'rounded-lg px-4 py-3 border border-glass-border bg-surface';
const CARD_HEADER = 'flex justify-between items-center mb-2';
const CARD_BADGE_BASE = 'text-[11px] font-semibold uppercase tracking-wide py-0.5 px-2 rounded-sm';
const CARD_CONTENT = 'text-sm leading-relaxed m-0';
const CARD_META = 'text-xs text-text-muted mt-1';
const CARD_DISMISS = 'bg-transparent border-none cursor-pointer text-lg text-text-muted px-1 leading-none hover:text-text';

const BADGE_VARIANTS: Record<string, string> = {
  hypothesis: 'bg-blue-100 text-blue-700',
  approval: 'bg-amber-100 text-amber-800',
  insight: 'bg-emerald-100 text-emerald-800',
  pipeline: 'bg-purple-100 text-purple-800',
  review: 'bg-amber-100 text-amber-600',
  prediction: 'bg-blue-100 text-blue-600',
};

function HypothesisCard({ card, onDismiss }: { card: AgUICard; onDismiss?: (id: string) => void }) {
  const { hypothesis, confidence, evidence } = card.payload as {
    hypothesis?: string;
    confidence?: number;
    evidence?: string;
  };
  return (
    <div className={CARD_BASE}>
      <div className={CARD_HEADER}>
        <span className={cn(CARD_BADGE_BASE, BADGE_VARIANTS.hypothesis)}>Hypothese</span>
        {onDismiss && (
          <button className={CARD_DISMISS} onClick={() => onDismiss(card.id)} aria-label="Schlie\u00dfen">
            &times;
          </button>
        )}
      </div>
      <p className={CARD_CONTENT}>{hypothesis}</p>
      {confidence != null && <div className={CARD_META}>Konfidenz: {Math.round(confidence * 100)}%</div>}
      {evidence && <div className={CARD_META}>Evidenz: {evidence}</div>}
    </div>
  );
}

function ApprovalCard({ card, onDismiss }: { card: AgUICard; onDismiss?: (id: string) => void }) {
  const { action, description, risk } = card.payload as {
    action?: string;
    description?: string;
    risk?: string;
  };
  return (
    <div className={CARD_BASE}>
      <div className={CARD_HEADER}>
        <span className={cn(CARD_BADGE_BASE, BADGE_VARIANTS.approval)}>Genehmigung erforderlich</span>
        {onDismiss && (
          <button className={CARD_DISMISS} onClick={() => onDismiss(card.id)} aria-label="Schlie\u00dfen">
            &times;
          </button>
        )}
      </div>
      <p className={CARD_CONTENT}>{description}</p>
      <div className={CARD_META}>Aktion: {action} | Risiko: {risk}</div>
      <div className="flex gap-2 mt-2">
        <button className="py-1.5 px-4 rounded-md text-[13px] font-medium cursor-pointer border-none bg-green-500 text-white">Genehmigen</button>
        <button className="py-1.5 px-4 rounded-md text-[13px] font-medium cursor-pointer border-none bg-red-500 text-white">Ablehnen</button>
      </div>
    </div>
  );
}

function InsightCard({ card, onDismiss }: { card: AgUICard; onDismiss?: (id: string) => void }) {
  const { insight, source } = card.payload as {
    insight?: string;
    source?: string;
  };
  return (
    <div className={CARD_BASE}>
      <div className={CARD_HEADER}>
        <span className={cn(CARD_BADGE_BASE, BADGE_VARIANTS.insight)}>Erkenntnis</span>
        {onDismiss && (
          <button className={CARD_DISMISS} onClick={() => onDismiss(card.id)} aria-label="Schlie\u00dfen">
            &times;
          </button>
        )}
      </div>
      <p className={CARD_CONTENT}>{insight}</p>
      {source && <div className={CARD_META}>Quelle: {source}</div>}
    </div>
  );
}

function ReviewCard({ card, onDismiss }: { card: AgUICard; onDismiss?: (id: string) => void }) {
  const { question, lastReviewed } = card.payload as {
    question?: string;
    lastReviewed?: string;
  };
  return (
    <div className={CARD_BASE}>
      <div className={CARD_HEADER}>
        <span className={cn(CARD_BADGE_BASE, BADGE_VARIANTS.review)}>Wiederholung</span>
        {onDismiss && (
          <button className={CARD_DISMISS} onClick={() => onDismiss(card.id)} aria-label="Schlie\u00dfen">
            &times;
          </button>
        )}
      </div>
      <p className={CARD_CONTENT}>{question}</p>
      {lastReviewed && <div className={CARD_META}>Zuletzt: {lastReviewed}</div>}
    </div>
  );
}

function PredictionCard({ card, onDismiss }: { card: AgUICard; onDismiss?: (id: string) => void }) {
  const { intent, confidence } = card.payload as {
    intent?: string;
    confidence?: number;
  };
  return (
    <div className={CARD_BASE}>
      <div className={CARD_HEADER}>
        <span className={cn(CARD_BADGE_BASE, BADGE_VARIANTS.prediction)}>Vorhersage</span>
        {onDismiss && (
          <button className={CARD_DISMISS} onClick={() => onDismiss(card.id)} aria-label="Schließen">
            &times;
          </button>
        )}
      </div>
      <p className={CARD_CONTENT}>{intent}</p>
      {confidence != null && <div className={CARD_META}>Konfidenz: {Math.round(confidence * 100)}%</div>}
    </div>
  );
}

const STEP_INDICATOR_COLORS: Record<string, string> = {
  pending: 'bg-gray-300',
  running: 'bg-blue-500 animate-pulse',
  complete: 'bg-green-500',
  error: 'bg-red-500',
};

function PipelineCard({ status }: { status: Record<string, unknown> }) {
  const steps = (status as { steps?: Record<string, { status?: string }> }).steps || {};
  return (
    <div className={CARD_BASE}>
      <div className={CARD_HEADER}>
        <span className={cn(CARD_BADGE_BASE, BADGE_VARIANTS.pipeline)}>Pipeline</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(steps).map(([name, info]) => (
          <div key={name} className="flex items-center gap-1.5 text-[13px]">
            <span className={cn('size-2 rounded-full', STEP_INDICATOR_COLORS[info.status || 'pending'] || STEP_INDICATOR_COLORS.pending)} />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgUICards;
