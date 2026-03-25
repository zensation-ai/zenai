import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';
import { PanelEmptyState } from './PanelEmptyState';
import { EmptyDocuments } from '../../../assets/illustrations';

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
        {activeTab === 'documents' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyDocuments width={80} height={80} />}
            title="Keine Dokumente"
            description="Lade Dokumente hoch oder erstelle neue."
            action={{ label: 'Dokument hochladen', onClick: () => {/* TODO */} }}
          />
        )}
        {activeTab === 'editor' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyDocuments width={80} height={80} />}
            title="Kein Dokument geoeffnet"
            description="Oeffne oder erstelle ein Dokument im Editor."
          />
        )}
        {activeTab === 'media' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyDocuments width={80} height={80} />}
            title="Keine Medien"
            description="Bilder und Dateien erscheinen hier."
          />
        )}
      </div>
    </div>
  );
}
