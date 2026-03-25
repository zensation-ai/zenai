import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';

const TABS = [
  { id: 'profile', label: 'Profil' },
  { id: 'general', label: 'Allgemein' },
  { id: 'ai', label: 'KI' },
  { id: 'data', label: 'Daten' },
];

export default function SettingsPanel(_props: PanelProps) {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="panel-content">
      <PanelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="panel-body">
        {activeTab === 'profile' && <div className="panel-placeholder">Profil-Einstellungen</div>}
        {activeTab === 'general' && <div className="panel-placeholder">Allgemeine Einstellungen</div>}
        {activeTab === 'ai' && <div className="panel-placeholder">KI-Einstellungen</div>}
        {activeTab === 'data' && <div className="panel-placeholder">Daten & Export</div>}
      </div>
    </div>
  );
}
