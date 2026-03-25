import { useState, useCallback } from 'react';
import {
  MessageSquare, Lightbulb, Calendar, Mail, Menu,
  FileText, BarChart3, Brain, Settings, X,
} from 'lucide-react';
import { usePanelContext } from '../../contexts/PanelContext';
import type { PanelType } from '../../contexts/PanelContext';
import './CockpitBottomBar.css';

interface BottomNavItem {
  id: string;
  icon: typeof MessageSquare;
  label: string;
  panel: PanelType | null;
}

const PRIMARY_ITEMS: BottomNavItem[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat', panel: null },
  { id: 'ideas', icon: Lightbulb, label: 'Ideen', panel: 'ideas' },
  { id: 'email', icon: Mail, label: 'Email', panel: 'email' },
  { id: 'calendar', icon: Calendar, label: 'Kalender', panel: 'calendar' },
];

const MORE_ITEMS: BottomNavItem[] = [
  { id: 'documents', icon: FileText, label: 'Dokumente', panel: 'documents' },
  { id: 'finance', icon: BarChart3, label: 'Finanzen', panel: 'finance' },
  { id: 'memory', icon: Brain, label: 'Gedaechtnis', panel: 'memory' },
  { id: 'settings', icon: Settings, label: 'Einstellungen', panel: 'settings' },
];

export function CockpitBottomBar() {
  const { state, dispatch } = usePanelContext();
  const [showMore, setShowMore] = useState(false);

  const isActive = useCallback((item: BottomNavItem) => {
    if (item.panel === null) {
      return state.activePanel === null;
    }
    return state.activePanel === item.panel;
  }, [state.activePanel]);

  const handleClick = useCallback((item: BottomNavItem) => {
    setShowMore(false);
    if (item.panel === null) {
      dispatch({ type: 'CLOSE_PANEL' });
    } else if (state.activePanel === item.panel) {
      dispatch({ type: 'CLOSE_PANEL' });
    } else {
      dispatch({ type: 'OPEN_PANEL', panel: item.panel });
    }
  }, [dispatch, state.activePanel]);

  const isMoreActive = MORE_ITEMS.some(item => state.activePanel === item.panel);

  return (
    <>
      {/* More sheet overlay */}
      {showMore && (
        <div
          className="cockpit-bottom-sheet__backdrop"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* More sheet */}
      {showMore && (
        <div className="cockpit-bottom-sheet" role="menu" aria-label="Weitere Navigation">
          <div className="cockpit-bottom-sheet__header">
            <span className="cockpit-bottom-sheet__title">Mehr</span>
            <button
              className="cockpit-bottom-sheet__close"
              onClick={() => setShowMore(false)}
              aria-label="Schliessen"
            >
              <X size={18} />
            </button>
          </div>
          <div className="cockpit-bottom-sheet__grid">
            {MORE_ITEMS.map(item => (
              <button
                key={item.id}
                className={`cockpit-bottom-sheet__item ${isActive(item) ? 'cockpit-bottom-sheet__item--active' : ''}`}
                onClick={() => handleClick(item)}
                role="menuitem"
              >
                <item.icon size={22} />
                <span className="cockpit-bottom-sheet__label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <nav className="cockpit-bottom-bar" role="navigation" aria-label="Hauptnavigation">
        {PRIMARY_ITEMS.map(item => (
          <button
            key={item.id}
            className={`cockpit-bottom-bar__item ${isActive(item) ? 'cockpit-bottom-bar__item--active' : ''}`}
            onClick={() => handleClick(item)}
            aria-label={item.label}
            aria-current={isActive(item) ? 'page' : undefined}
          >
            <item.icon size={22} />
            <span className="cockpit-bottom-bar__label">{item.label}</span>
          </button>
        ))}
        <button
          className={`cockpit-bottom-bar__item ${isMoreActive ? 'cockpit-bottom-bar__item--active' : ''} ${showMore ? 'cockpit-bottom-bar__item--active' : ''}`}
          onClick={() => setShowMore(prev => !prev)}
          aria-label="Mehr"
          aria-expanded={showMore}
        >
          <Menu size={22} />
          <span className="cockpit-bottom-bar__label">Mehr</span>
        </button>
      </nav>
    </>
  );
}
