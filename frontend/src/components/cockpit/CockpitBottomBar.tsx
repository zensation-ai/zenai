import {
  MessageSquare, Lightbulb, Calendar, Mail, Settings,
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

const NAV_ITEMS: BottomNavItem[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat', panel: null },
  { id: 'ideas', icon: Lightbulb, label: 'Ideen', panel: 'ideas' },
  { id: 'calendar', icon: Calendar, label: 'Kalender', panel: 'calendar' },
  { id: 'email', icon: Mail, label: 'Email', panel: 'email' },
  { id: 'settings', icon: Settings, label: 'System', panel: 'settings' },
];

export function CockpitBottomBar() {
  const { state, dispatch } = usePanelContext();

  const isActive = (item: BottomNavItem) => {
    if (item.panel === null) {
      return state.activePanel === null;
    }
    return state.activePanel === item.panel;
  };

  const handleClick = (item: BottomNavItem) => {
    if (item.panel === null) {
      dispatch({ type: 'CLOSE_PANEL' });
    } else if (state.activePanel === item.panel) {
      dispatch({ type: 'CLOSE_PANEL' });
    } else {
      dispatch({ type: 'OPEN_PANEL', panel: item.panel });
    }
  };

  return (
    <nav className="cockpit-bottom-bar" role="navigation" aria-label="Hauptnavigation">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`cockpit-bottom-bar__item ${isActive(item) ? 'cockpit-bottom-bar__item--active' : ''}`}
          onClick={() => handleClick(item)}
          aria-label={item.label}
          aria-current={isActive(item) ? 'page' : undefined}
        >
          <item.icon size={22} />
          {isActive(item) && (
            <span className="cockpit-bottom-bar__indicator" />
          )}
        </button>
      ))}
    </nav>
  );
}
