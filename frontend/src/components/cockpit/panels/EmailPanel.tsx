import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';

const TABS = [
  { id: 'inbox', label: 'Posteingang' },
  { id: 'sent', label: 'Gesendet' },
  { id: 'drafts', label: 'Entwuerfe' },
];

export default function EmailPanel(_props: PanelProps) {
  const [activeTab, setActiveTab] = useState('inbox');

  return (
    <div className="panel-content">
      <PanelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="panel-body">
        {activeTab === 'inbox' && <div className="panel-placeholder">Posteingang</div>}
        {activeTab === 'sent' && <div className="panel-placeholder">Gesendet</div>}
        {activeTab === 'drafts' && <div className="panel-placeholder">Entwuerfe</div>}
      </div>
    </div>
  );
}
