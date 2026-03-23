import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rail } from './Rail';
import { PanelArea } from './PanelArea';
import { CockpitBottomBar } from './CockpitBottomBar';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './CockpitLayout.css';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface CockpitLayoutProps {
  currentPage: 'chat' | 'dashboard' | 'settings';
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  children: ReactNode;
  hasActivity?: boolean;
  sessions?: Array<{ id: string; title: string; updatedAt?: string }>;
  onSwitchSession?: (id: string) => void;
}

const PAGE_ROUTES: Record<string, string> = {
  chat: '/chat',
  dashboard: '/dashboard',
  settings: '/settings',
};

export function CockpitLayout({ currentPage, context, onContextChange, children, hasActivity, sessions, onSwitchSession }: CockpitLayoutProps) {
  const isMobile = useMediaQuery(767);
  const navigate = useNavigate();

  const handleMobileNavigate = (page: 'chat' | 'dashboard' | 'settings') => {
    navigate(PAGE_ROUTES[page]);
  };

  return (
    <div className="cockpit-layout">
      {!isMobile && (
        <Rail
          currentPage={currentPage}
          context={context}
          onContextChange={onContextChange}
          hasActivity={hasActivity}
          sessions={sessions}
          onSwitchSession={onSwitchSession}
        />
      )}
      <main className="cockpit-layout__chat">
        {children}
      </main>
      <PanelArea context={context} isMobile={isMobile} />
      {isMobile && (
        <CockpitBottomBar
          currentPage={currentPage}
          onNavigate={handleMobileNavigate}
        />
      )}
    </div>
  );
}
