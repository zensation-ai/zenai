import { useState, useCallback } from 'react';
import {
  MessageSquare, Lightbulb, Calendar, Mail,
  FileText, BarChart3, Brain, Settings,
} from 'lucide-react';
import { usePanelContext } from '../../contexts/PanelContext';
import type { PanelType } from '../../contexts/PanelContext';
import './Rail.css';

const CONTEXT_COLORS: Record<string, string> = {
  personal: '#0EA5E9',
  work: '#3B82F6',
  learning: '#10B981',
  creative: '#8B5CF6',
};

const CONTEXT_LABELS: Record<string, string> = {
  personal: 'Privat',
  work: 'Arbeit',
  learning: 'Lernen',
  creative: 'Kreativ',
};

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface RailProps {
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  hasActivity?: boolean;
  sessions?: Array<{ id: string; title: string; updatedAt?: string }>;
  onSwitchSession?: (id: string) => void;
}

interface NavItem {
  id: 'chat' | PanelType;
  icon: typeof MessageSquare;
  label: string;
  panel: PanelType | null; // null = chat (close panel)
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat', panel: null },
  { id: 'ideas', icon: Lightbulb, label: 'Ideen', panel: 'ideas' },
  { id: 'calendar', icon: Calendar, label: 'Kalender', panel: 'calendar' },
  { id: 'email', icon: Mail, label: 'Email', panel: 'email' },
  { id: 'documents', icon: FileText, label: 'Dokumente', panel: 'documents' },
  { id: 'finance', icon: BarChart3, label: 'Finanzen', panel: 'finance' },
  { id: 'memory', icon: Brain, label: 'Gedaechtnis', panel: 'memory' },
];

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

export function Rail({ context, onContextChange, hasActivity, sessions, onSwitchSession }: RailProps) {
  const { state, dispatch } = usePanelContext();
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

  const handleNavClick = useCallback((item: NavItem) => {
    if (item.panel === null) {
      dispatch({ type: 'CLOSE_PANEL' });
    } else {
      // If same panel is already open, close it (toggle behavior)
      if (state.activePanel === item.panel) {
        dispatch({ type: 'CLOSE_PANEL' });
      } else {
        dispatch({ type: 'OPEN_PANEL', panel: item.panel });
      }
    }
  }, [dispatch, state.activePanel]);

  const isActive = (item: NavItem) => {
    if (item.panel === null) {
      return state.activePanel === null;
    }
    return state.activePanel === item.panel;
  };

  const showDot = hasActivity && state.activePanel !== null;
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
              className={`rail__item ${isActive(item) ? 'rail__item--active' : ''}`}
              onClick={() => handleNavClick(item)}
              aria-label={item.label}
              data-tooltip={item.label}
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
          className="rail__context-btn"
          onClick={cycleContext}
          aria-label="Kontext wechseln"
          style={{ '--context-color': CONTEXT_COLORS[context] } as React.CSSProperties}
          data-tooltip={CONTEXT_LABELS[context]}
        >
          <span className="rail__context-dot" />
          <span className="rail__context-label">{CONTEXT_LABELS[context]}</span>
        </button>
        <button
          className={`rail__item ${state.activePanel === 'settings' ? 'rail__item--active' : ''}`}
          onClick={() => {
            if (state.activePanel === 'settings') {
              dispatch({ type: 'CLOSE_PANEL' });
            } else {
              dispatch({ type: 'OPEN_PANEL', panel: 'settings' });
            }
          }}
          aria-label="Einstellungen"
          data-tooltip="Einstellungen"
        >
          <Settings size={20} />
        </button>
      </div>
    </nav>
  );
}
