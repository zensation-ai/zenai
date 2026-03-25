import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';

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
        {activeTab === 'facts' && <div className="panel-placeholder">Fakten</div>}
        {activeTab === 'procedures' && <div className="panel-placeholder">Prozeduren</div>}
        {activeTab === 'graph' && <div className="panel-placeholder">Graph</div>}
      </div>
    </div>
  );
}
