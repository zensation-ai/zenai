import type { CSSProperties } from 'react';
import { X, CheckCircle2, Circle } from 'lucide-react';
import { useFeatureDiscovery } from '../../hooks/useFeatureDiscovery';
import { cn } from '@/lib/utils';

export function SetupProgress() {
  const { features, discovered, completedCount, totalCount, visible, dismiss } = useFeatureDiscovery();

  if (!visible) return null;

  const progress = (completedCount / totalCount) * 100;

  return (
    <div className="col-span-full rounded-xl border border-white/10 bg-surface/60 backdrop-blur-md p-4 relative animate-fade-in">
      <button
        type="button"
        aria-label="Schließen"
        className="absolute top-3 right-3 p-1 rounded-md text-text-muted hover:text-text hover:bg-white/10 transition-colors"
        onClick={dismiss}
      >
        <X size={14} />
      </button>

      <div className="flex items-center justify-between mb-2 pr-6">
        <h3 className="text-sm font-semibold text-text">
          {completedCount} von {totalCount} Features entdeckt
        </h3>
        <span className="text-xs text-text-muted">{Math.round(progress)}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/10 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-[var(--primary-light,#ff8c5a)] rounded-full transition-all duration-500 w-[var(--bar)]"
          style={{ '--bar': `${progress}%` } as CSSProperties}
        />
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
        {features.map((feature) => {
          const done = discovered.has(feature.id);
          return (
            <div
              key={feature.id}
              title={feature.description}
              className={cn(
                'flex items-center gap-1.5 py-1 text-xs transition-colors',
                done ? 'text-text' : 'text-text-muted',
              )}
            >
              {done ? (
                <CheckCircle2 size={13} className="text-success shrink-0" />
              ) : (
                <Circle size={13} className="shrink-0 opacity-40" />
              )}
              <span className={cn('truncate', done && 'line-through opacity-60')}>{feature.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
