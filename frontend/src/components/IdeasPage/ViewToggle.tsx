import { LayoutGrid, List, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from './types';

interface ViewToggleProps {
  active: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const VIEWS: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Rasteransicht' },
  { mode: 'list', icon: List, label: 'Listenansicht' },
  { mode: 'graph', icon: GitBranch, label: 'Graphansicht' },
];

export function ViewToggle({ active, onChange }: ViewToggleProps) {
  return (
    <div className="flex border border-glass-border rounded-md overflow-hidden" role="group" aria-label="Ansicht">
      {VIEWS.map(({ mode, icon: Icon, label }, i) => (
        <button
          key={mode}
          className={cn(
            'flex items-center justify-center w-9 h-9 border-none bg-transparent text-text-secondary cursor-pointer transition-all duration-150',
            'hover:bg-glass-bg',
            'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px] focus-visible:z-[1]',
            i < VIEWS.length - 1 && 'border-r border-glass-border',
            active === mode && 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
          aria-label={label}
          aria-pressed={active === mode}
          onClick={() => onChange(mode)}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
