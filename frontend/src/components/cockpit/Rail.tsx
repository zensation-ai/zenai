import { useState, useCallback } from 'react';
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
  hasActivity?: boolean;
  sessions?: Array<{ id: string; title: string; updatedAt?: string }>;
  onSwitchSession?: (id: string) => void;
}

const NAV_ITEMS = [
  { id: 'chat' as const, icon: MessageSquare, label: 'Chat', path: '/chat' },
  { id: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
] as const;

const CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return `vor ${days}d`;
}

export function Rail({ currentPage, context, onContextChange, hasActivity, sessions, onSwitchSession }: RailProps) {
  const navigate = useNavigate();
  const [showSessionList, setShowSessionList] = useState(false);

  const cycleContext = () => {
    const idx = CONTEXTS.indexOf(context);
    const next = CONTEXTS[(idx + 1) % CONTEXTS.length];
    onContextChange(next);
  };

  const handleSessionClick = useCallback((id: string) => {
    onSwitchSession?.(id);
    setShowSessionList(false);
  }, [onSwitchSession]);

  const showDot = hasActivity && currentPage !== 'chat';
  const displaySessions = sessions?.slice(0, 5) ?? [];

  return (
    <nav className="rail" role="navigation" aria-label="Hauptnavigation">
      <div className="rail__top">
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className="rail__item-wrapper"
            onMouseEnter={item.id === 'chat' ? () => setShowSessionList(true) : undefined}
            onMouseLeave={item.id === 'chat' ? () => setShowSessionList(false) : undefined}
          >
            <button
              className={`rail__item ${currentPage === item.id ? 'rail__item--active' : ''}`}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
            >
              <item.icon size={20} />
              {item.id === 'chat' && showDot && (
                <span className="rail__activity-dot" aria-label="Neue Aktivitaet" />
              )}
            </button>
            {item.id === 'chat' && showSessionList && displaySessions.length > 0 && (
              <div className="rail__session-popup" role="menu" aria-label="Letzte Chats">
                {displaySessions.map(s => (
                  <button
                    key={s.id}
                    className="rail__session-item"
                    role="menuitem"
                    onClick={() => handleSessionClick(s.id)}
                  >
                    <span className="rail__session-title">{s.title || 'Neuer Chat'}</span>
                    {s.updatedAt && (
                      <span className="rail__session-time">{relativeTime(s.updatedAt)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
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
