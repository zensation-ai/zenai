import { memo } from 'react';
import { Star, Lightbulb, CheckCircle, Zap, HelpCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { StructuredIdea } from '../../types';
import type { ViewMode } from './types';

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
      className={cn(
        'flex flex-col gap-2 p-4 rounded-lg glass cursor-pointer transition-all duration-200 ease-out relative',
        'hover:-translate-y-px hover:shadow-lg',
        'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
        isSelected && 'border-primary bg-primary/[0.08]',
        view === 'list' && 'flex-row items-center gap-3 py-3 px-4 rounded-md'
      )}
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
          className="absolute top-2 left-2 w-[18px] h-[18px] accent-primary"
          checked={isSelected}
          onChange={e => onSelect?.(idea.id, e.target.checked)}
          onClick={e => e.stopPropagation()}
        />
      )}
      <div className={cn('flex items-center gap-2 min-w-0', view === 'list' && 'flex-1')}>
        <TypeIcon size={16} className="text-text-secondary shrink-0" />
        <h3 className="text-[0.9375rem] font-semibold text-text m-0 overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">{idea.title}</h3>
        {idea.is_favorite && (
          <Star size={14} className="text-yellow-500 shrink-0" fill="currentColor" aria-label="Favorit" />
        )}
      </div>
      <p className={cn(
        'text-[0.8125rem] text-text-secondary leading-relaxed line-clamp-2 m-0',
        view === 'list' && 'hidden'
      )}>{idea.summary}</p>
      <div className={cn('flex items-center gap-1.5 flex-wrap', view === 'list' && 'shrink-0')}>
        <Badge
          variant="outline"
          className={cn(
            'text-[0.6875rem] font-semibold uppercase tracking-wide',
            idea.priority === 'high' && 'bg-red-500/15 text-red-500 border-transparent',
            idea.priority === 'medium' && 'bg-yellow-500/15 text-yellow-500 border-transparent',
            idea.priority === 'low' && 'bg-primary/15 text-primary border-transparent'
          )}
        >
          {PRIORITY_LABELS[idea.priority] ?? idea.priority}
        </Badge>
        {idea.keywords?.slice(0, 3).map(kw => (
          <Badge key={kw} variant="outline" className="text-[0.6875rem] text-text-secondary bg-glass-bg">
            {kw}
          </Badge>
        ))}
      </div>
    </article>
  );
});
