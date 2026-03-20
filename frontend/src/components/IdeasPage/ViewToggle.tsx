import { LayoutGrid, List, GitBranch } from 'lucide-react';
import type { ViewMode } from './types';
import './ViewToggle.css';

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
    <div className="view-toggle" role="group" aria-label="Ansicht">
      {VIEWS.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          className={`view-toggle__btn ${active === mode ? 'view-toggle__btn--active' : ''}`}
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
