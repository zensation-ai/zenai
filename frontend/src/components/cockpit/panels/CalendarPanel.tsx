import { useState } from 'react';
import type { PanelProps } from '../panelRegistry';
import { PanelTabs } from '../PanelTabs';
import { PanelEmptyState } from './PanelEmptyState';
import { EmptyCalendar, EmptyTasks } from '../../../assets/illustrations';

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
        {activeTab === 'calendar' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyCalendar width={80} height={80} />}
            title="Keine Termine"
            description="Dein Kalender ist noch leer."
            action={{ label: 'Termin erstellen', onClick: () => {/* TODO */} }}
          />
        )}
        {activeTab === 'tasks' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyTasks width={80} height={80} />}
            title="Keine Aufgaben"
            description="Erstelle Aufgaben um organisiert zu bleiben."
            action={{ label: 'Aufgabe erstellen', onClick: () => {/* TODO */} }}
          />
        )}
        {activeTab === 'projects' && (
          <PanelEmptyState
            variant="welcome"
            illustration={<EmptyTasks width={80} height={80} />}
            title="Keine Projekte"
            description="Organisiere deine Aufgaben in Projekten."
            action={{ label: 'Projekt erstellen', onClick: () => {/* TODO */} }}
          />
        )}
      </div>
    </div>
  );
}
