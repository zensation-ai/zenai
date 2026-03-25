import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';
import { PanelEmptyState } from './PanelEmptyState';
import { EmptyIdeas } from '../../../assets/illustrations';

const TABS = [
  { id: 'active', label: 'Aktiv' },
  { id: 'incubator', label: 'Inkubator' },
  { id: 'archive', label: 'Archiv' },
];

export default function IdeasPanel(_props: PanelProps) {
  const [activeTab, setActiveTab] = useState('active');

  return (
    <div className="panel-content">
      <PanelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="panel-body">
        {activeTab === 'active' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyIdeas width={80} height={80} />}
            title="Noch keine Ideen"
            description="Deine Gedanken und Ideen erscheinen hier."
            action={{ label: 'Erste Idee erstellen', onClick: () => {/* TODO */} }}
          />
        )}
        {activeTab === 'incubator' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyIdeas width={80} height={80} />}
            title="Inkubator leer"
            description="Ideen zum Reifen lassen landen hier."
          />
        )}
        {activeTab === 'archive' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyIdeas width={80} height={80} />}
            title="Archiv leer"
            description="Abgeschlossene Ideen werden hier archiviert."
          />
        )}
      </div>
    </div>
  );
}
