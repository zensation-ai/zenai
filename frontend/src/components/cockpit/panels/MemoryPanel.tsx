import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';
import { PanelEmptyState } from './PanelEmptyState';
import { EmptyAI } from '../../../assets/illustrations';

const TABS = [
  { id: 'facts', label: 'Fakten' },
  { id: 'procedures', label: 'Prozeduren' },
  { id: 'graph', label: 'Graph' },
];

export default function MemoryPanel(_props: PanelProps) {
  const [activeTab, setActiveTab] = useState('facts');

  return (
    <div className="panel-content">
      <PanelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="panel-body">
        {activeTab === 'facts' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyAI width={80} height={80} />}
            title="Noch keine Erinnerungen"
            description="Die KI lernt aus deinen Gespraechen."
          />
        )}
        {activeTab === 'procedures' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyAI width={80} height={80} />}
            title="Keine Prozeduren"
            description="Gelernte Vorgehensweisen erscheinen hier."
          />
        )}
        {activeTab === 'graph' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyAI width={80} height={80} />}
            title="Wissensgraph leer"
            description="Verbindungen zwischen deinem Wissen werden hier visualisiert."
          />
        )}
      </div>
    </div>
  );
}
