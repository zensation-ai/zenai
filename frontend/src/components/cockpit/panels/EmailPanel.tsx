import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';
import { PanelEmptyState } from './PanelEmptyState';
import { EmptyInbox } from '../../../assets/illustrations';

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
        {activeTab === 'inbox' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyInbox width={80} height={80} />}
            title="Posteingang ist leer"
            description="Neue E-Mails erscheinen hier automatisch."
          />
        )}
        {activeTab === 'sent' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyInbox width={80} height={80} />}
            title="Keine gesendeten E-Mails"
            description="Gesendete E-Mails erscheinen hier."
          />
        )}
        {activeTab === 'drafts' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyInbox width={80} height={80} />}
            title="Keine Entwuerfe"
            description="E-Mail-Entwuerfe werden hier gespeichert."
          />
        )}
      </div>
    </div>
  );
}
