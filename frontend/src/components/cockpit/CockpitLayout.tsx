import { type ReactNode } from 'react';
import { Rail } from './Rail';
import { PanelArea } from './PanelArea';
import './CockpitLayout.css';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface CockpitLayoutProps {
  currentPage: 'chat' | 'dashboard' | 'settings';
  context: AIContext;
  onContextChange: (ctx: AIContext) => void;
  children: ReactNode;
}

export function CockpitLayout({ currentPage, context, onContextChange, children }: CockpitLayoutProps) {
  return (
    <div className="cockpit-layout">
      <Rail
        currentPage={currentPage}
        context={context}
        onContextChange={onContextChange}
      />
      <main className="cockpit-layout__chat">
        {children}
      </main>
      <PanelArea context={context} />
    </div>
  );
}
