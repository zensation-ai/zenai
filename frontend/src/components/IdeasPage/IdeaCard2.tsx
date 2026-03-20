import { memo } from 'react';
import { Star, Lightbulb, CheckCircle, Zap, HelpCircle, AlertTriangle } from 'lucide-react';
import type { StructuredIdea } from '../../types';
import type { ViewMode } from './types';
import './IdeaCard2.css';

interface IdeaCard2Props {
  idea: StructuredIdea;
  onClick: (idea: StructuredIdea) => void;
  view?: ViewMode;
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

const TYPE_ICONS: Record<string, typeof Lightbulb> = {
  idea: Lightbulb,
  task: CheckCircle,
  insight: Zap,
  problem: AlertTriangle,
  question: HelpCircle,
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

export const IdeaCard2 = memo(function IdeaCard2({
  idea,
  onClick,
  view = 'grid',
  selectionMode,
  isSelected,
  onSelect,
}: IdeaCard2Props) {
  const TypeIcon = TYPE_ICONS[idea.type] ?? Lightbulb;

  return (
    <article
      className={`idea-card2 ${isSelected ? 'idea-card2--selected' : ''}`}
      data-view={view}
      onClick={() => selectionMode && onSelect ? onSelect(idea.id, !isSelected) : onClick(idea)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectionMode && onSelect ? onSelect(idea.id, !isSelected) : onClick(idea);
        }
      }}
    >
      {selectionMode && (
        <input
          type="checkbox"
          className="idea-card2__checkbox"
          checked={isSelected}
          onChange={e => onSelect?.(idea.id, e.target.checked)}
          onClick={e => e.stopPropagation()}
        />
      )}
      <div className="idea-card2__header">
        <TypeIcon size={16} className="idea-card2__type-icon" />
        <h3 className="idea-card2__title">{idea.title}</h3>
        {idea.is_favorite && (
          <Star size={14} className="idea-card2__fav" fill="currentColor" aria-label="Favorit" />
        )}
      </div>
      <p className="idea-card2__summary">{idea.summary}</p>
      <div className="idea-card2__footer">
        <span className={`idea-card2__priority idea-card2__priority--${idea.priority}`}>
          {PRIORITY_LABELS[idea.priority] ?? idea.priority}
        </span>
        {idea.keywords?.slice(0, 3).map(kw => (
          <span key={kw} className="idea-card2__keyword">{kw}</span>
        ))}
      </div>
    </article>
  );
});
