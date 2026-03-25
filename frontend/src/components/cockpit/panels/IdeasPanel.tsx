import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';

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
        {activeTab === 'active' && <div className="panel-placeholder">Aktive Ideen</div>}
        {activeTab === 'incubator' && <div className="panel-placeholder">Inkubator</div>}
        {activeTab === 'archive' && <div className="panel-placeholder">Archiv</div>}
      </div>
    </div>
  );
}
