import { useNavigate } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Settings } from 'lucide-react';
import './Rail.css';

const CONTEXT_COLORS: Record<string, string> = {
  personal: '#0EA5E9',
  work: '#3B82F6',
  learning: '#10B981',
  creative: '#8B5CF6',
};

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface RailProps {
  currentPage: 'chat' | 'dashboard' | 'settings';
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
}

const NAV_ITEMS = [
  { id: 'chat' as const, icon: MessageSquare, label: 'Chat', path: '/chat' },
  { id: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
] as const;

const CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

export function Rail({ currentPage, context, onContextChange }: RailProps) {
  const navigate = useNavigate();

  const cycleContext = () => {
    const idx = CONTEXTS.indexOf(context);
    const next = CONTEXTS[(idx + 1) % CONTEXTS.length];
    onContextChange(next);
  };

  return (
    <nav className="rail" role="navigation" aria-label="Hauptnavigation">
      <div className="rail__top">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`rail__item ${currentPage === item.id ? 'rail__item--active' : ''}`}
            onClick={() => navigate(item.path)}
            aria-label={item.label}
          >
            <item.icon size={20} />
          </button>
        ))}
      </div>
      <div className="rail__bottom">
        <button
          className="rail__item rail__context"
          onClick={cycleContext}
          aria-label="Kontext wechseln"
          style={{ '--context-color': CONTEXT_COLORS[context] } as React.CSSProperties}
        >
          <div className="rail__context-ring" />
        </button>
        <button
          className={`rail__item ${currentPage === 'settings' ? 'rail__item--active' : ''}`}
          onClick={() => navigate('/settings')}
          aria-label="Einstellungen"
        >
          <Settings size={20} />
        </button>
      </div>
    </nav>
  );
}
