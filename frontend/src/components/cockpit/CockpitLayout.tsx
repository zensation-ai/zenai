import { type ReactNode } from 'react';
import { Rail } from './Rail';
import { PanelArea } from './PanelArea';
import { CockpitBottomBar } from './CockpitBottomBar';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './CockpitLayout.css';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface CockpitLayoutProps {
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  children: ReactNode;
  hasActivity?: boolean;
  sessions?: Array<{ id: string; title: string; updatedAt?: string }>;
  onSwitchSession?: (id: string) => void;
}

export function CockpitLayout({ context, onContextChange, children, hasActivity, sessions, onSwitchSession }: CockpitLayoutProps) {
  const isMobile = useMediaQuery(767);

  return (
    <div className="cockpit-layout">
      {!isMobile && (
        <Rail
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
        <CockpitBottomBar />
      )}
    </div>
  );
}
