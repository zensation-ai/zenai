import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';

const TABS = [
  { id: 'calendar', label: 'Kalender' },
  { id: 'tasks', label: 'Aufgaben' },
  { id: 'projects', label: 'Projekte' },
];

export default function CalendarPanel(_props: PanelProps) {
  const [activeTab, setActiveTab] = useState('calendar');

  return (
    <div className="panel-content">
      <PanelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="panel-body">
        {activeTab === 'calendar' && <div className="panel-placeholder">Kalender</div>}
        {activeTab === 'tasks' && <div className="panel-placeholder">Aufgaben</div>}
        {activeTab === 'projects' && <div className="panel-placeholder">Projekte</div>}
      </div>
    </div>
  );
}
