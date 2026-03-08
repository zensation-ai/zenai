/**
 * AIWorkshop - KI-Werkstatt
 *
 * Tabs: Vorschlaege, Entwicklung, Agenten
 */

import React, { Suspense, lazy, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import { HubPage, type TabDef } from './HubPage';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import './AIWorkshop.css';

const ProactiveDashboard = lazy(() => import('./ProactiveDashboard').then(m => ({ default: m.ProactiveDashboard })));
const EvolutionDashboard = lazy(() => import('./EvolutionDashboard').then(m => ({ default: m.EvolutionDashboard })));
const AgentTeamsPage = lazy(() => import('./AgentTeamsPage').then(m => ({ default: m.AgentTeamsPage })));

type WorkshopTab = 'proactive' | 'evolution' | 'agent-teams';

interface AIWorkshopProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: WorkshopTab;
}

const TABS: TabDef<WorkshopTab>[] = [
  { id: 'proactive', label: 'Vorschläge', icon: '✨', description: 'KI-generierte Ideen und Routinen' },
  { id: 'evolution', label: 'Entwicklung', icon: '🌱', description: 'Wie deine Gedanken sich entwickeln' },
  { id: 'agent-teams', label: 'Agenten', icon: '👥', description: 'Multi-Agenten für komplexe Aufgaben' },
];

const TabLoader = () => (
  <div className="hub-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const AIWorkshopComponent: React.FC<AIWorkshopProps> = ({
  context,
  onBack,
  initialTab = 'proactive',
}) => {
  const { activeTab, handleTabChange } = useTabNavigation<WorkshopTab>({
    initialTab,
    validTabs: ['proactive', 'evolution', 'agent-teams'],
    defaultTab: 'proactive',
    basePath: '/workshop',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'proactive':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <ProactiveDashboard context={context} embedded />
            </div>
          </Suspense>
        );
      case 'evolution':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <EvolutionDashboard context={context} embedded />
            </div>
          </Suspense>
        );
      case 'agent-teams':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <AgentTeamsPage context={context} embedded />
            </div>
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Werkstatt"
      icon="🧪"
      subtitle="KI-Tools die für dich arbeiten"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
    >
      {renderTabContent()}
    </HubPage>
  );
};

export const AIWorkshop = memo(AIWorkshopComponent);
export default AIWorkshop;
