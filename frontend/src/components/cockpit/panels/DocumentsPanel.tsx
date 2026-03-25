import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';

const TABS = [
  { id: 'documents', label: 'Dokumente' },
  { id: 'editor', label: 'Editor' },
  { id: 'media', label: 'Medien' },
];

export default function DocumentsPanel(_props: PanelProps) {
  const [activeTab, setActiveTab] = useState('documents');

  return (
    <div className="panel-content">
      <PanelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="panel-body">
        {activeTab === 'documents' && <div className="panel-placeholder">Dokumente</div>}
        {activeTab === 'editor' && <div className="panel-placeholder">Editor</div>}
        {activeTab === 'media' && <div className="panel-placeholder">Medien</div>}
      </div>
    </div>
  );
}
