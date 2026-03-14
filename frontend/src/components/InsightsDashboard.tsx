/**
 * InsightsDashboard - Konsolidierte Insights-Ansicht
 *
 * Tabs: Statistiken, Zusammenfassung, Verbindungen
 */

import React, { Suspense, lazy, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import { HubPage, type TabDef } from './HubPage';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import './InsightsDashboard.css';

const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboardV2 })));
const DigestDashboard = lazy(() => import('./DigestDashboard').then(m => ({ default: m.DigestDashboard })));
const KnowledgeGraphPage = lazy(() => import('./KnowledgeGraph/KnowledgeGraphPage'));
const GraphRAGPanel = lazy(() => import('./GraphRAGPanel').then(m => ({ default: m.GraphRAGPanel })));
const SleepInsights = lazy(() => import('./InsightsDashboard/SleepInsights').then(m => ({ default: m.SleepInsights })));

type InsightsTab = 'analytics' | 'digest' | 'connections' | 'graphrag' | 'sleep';

interface InsightsDashboardProps {
  context: AIContext;
  onBack: () => void;
  onSelectIdea?: (ideaId: string) => void;
  initialTab?: InsightsTab;
}

const TABS: TabDef<InsightsTab>[] = [
  { id: 'analytics', label: 'Statistiken', icon: '📈', description: 'Analysen, Trends und Produktivität' },
  { id: 'digest', label: 'Zusammenfassung', icon: '📊', description: 'Tägliche und wöchentliche Digests' },
  { id: 'connections', label: 'Verbindungen', icon: '🕸️', description: 'Wissens-Graph und Beziehungen' },
  { id: 'graphrag', label: 'GraphRAG', icon: '🔬', description: 'Entitaeten, Communities und Hybrid-Retrieval' },
  { id: 'sleep', label: 'KI-Nacht', icon: '🌙', description: 'Naechtliche Erkenntnisse und Memory-Konsolidierung' },
];

const TabLoader = () => (
  <div className="hub-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const InsightsDashboardComponent: React.FC<InsightsDashboardProps> = ({
  context,
  onBack,
  onSelectIdea,
  initialTab = 'analytics',
}) => {
  const { activeTab, handleTabChange } = useTabNavigation<InsightsTab>({
    initialTab,
    validTabs: ['analytics', 'digest', 'connections', 'graphrag', 'sleep'],
    defaultTab: 'analytics',
    basePath: '/insights',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'analytics':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <AnalyticsDashboard context={context} onBack={() => handleTabChange('analytics')} />
            </div>
          </Suspense>
        );
      case 'digest':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <DigestDashboard context={context} onBack={() => handleTabChange('analytics')} />
            </div>
          </Suspense>
        );
      case 'connections':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullheight">
              <KnowledgeGraphPage
                context={context}
                onBack={() => handleTabChange('analytics')}
                onSelectIdea={onSelectIdea ? (id: string) => onSelectIdea(id) : undefined}
              />
            </div>
          </Suspense>
        );
      case 'graphrag':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <GraphRAGPanel context={context} />
            </div>
          </Suspense>
        );
      case 'sleep':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <SleepInsights context={context} />
            </div>
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Insights"
      icon="📊"
      subtitle="Deine Gedanken im Überblick"
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

export const InsightsDashboard = memo(InsightsDashboardComponent);
export default InsightsDashboard;
