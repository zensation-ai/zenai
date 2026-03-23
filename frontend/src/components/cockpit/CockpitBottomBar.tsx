import { MessageSquare, LayoutDashboard, Settings } from 'lucide-react';
import './CockpitBottomBar.css';

interface CockpitBottomBarProps {
  currentPage: 'chat' | 'dashboard' | 'settings';
  onNavigate: (page: 'chat' | 'dashboard' | 'settings') => void;
}

const NAV_ITEMS = [
  { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
  { id: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'settings' as const, icon: Settings, label: 'Einstellungen' },
] as const;

export function CockpitBottomBar({ currentPage, onNavigate }: CockpitBottomBarProps) {
  return (
    <nav className="cockpit-bottom-bar" role="navigation" aria-label="Hauptnavigation">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`cockpit-bottom-bar__item ${currentPage === item.id ? 'cockpit-bottom-bar__item--active' : ''}`}
          onClick={() => onNavigate(item.id)}
          aria-label={item.label}
          aria-current={currentPage === item.id ? 'page' : undefined}
        >
          <item.icon size={22} />
          {currentPage === item.id && (
            <span className="cockpit-bottom-bar__indicator" />
          )}
        </button>
      ))}
    </nav>
  );
}
