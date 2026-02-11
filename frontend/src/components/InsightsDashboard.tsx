/**
 * InsightsDashboard - Konsolidierte Insights-Ansicht
 *
 * Kombiniert die ehemaligen separaten Seiten:
 * - Dashboard (Übersicht)
 * - Analytics (Statistiken)
 * - Digest (Zusammenfassungen)
 * - Knowledge Graph (Verbindungen)
 *
 * Neurowissenschaftliche Optimierungen:
 * - Tab-basierte Navigation für kognitive Entlastung
 * - Progressive Disclosure der Komplexität
 * - Einheitliches Design für bessere Orientierung
 */

import React, { Suspense, lazy, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import '../neurodesign.css';
import './InsightsDashboard.css';

// Lazy-load die Sub-Komponenten für bessere Performance
const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const DigestDashboard = lazy(() => import('./DigestDashboard').then(m => ({ default: m.DigestDashboard })));
const KnowledgeGraphPage = lazy(() => import('./KnowledgeGraph/KnowledgeGraphPage'));

type InsightsTab = 'analytics' | 'digest' | 'connections';

interface InsightsDashboardProps {
  context: AIContext;
  onBack: () => void;
  onSelectIdea?: (ideaId: string) => void;
  initialTab?: InsightsTab;
}

const TABS: { id: InsightsTab; label: string; icon: string; description: string }[] = [
  { id: 'analytics', label: 'Statistiken', icon: '📈', description: 'Analysen, Trends und Produktivität' },
  { id: 'digest', label: 'Zusammenfassung', icon: '📊', description: 'Tägliche und wöchentliche Digests' },
  { id: 'connections', label: 'Verbindungen', icon: '🕸️', description: 'Wissens-Graph und Beziehungen' },
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
    validTabs: ['analytics', 'digest', 'connections'],
    defaultTab: 'analytics',
    basePath: '/insights',
  });

  const handleSelectIdea = (ideaId: string) => {
    if (onSelectIdea) {
      onSelectIdea(ideaId);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'analytics':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <AnalyticsDashboard
                context={context}
                onBack={() => handleTabChange('analytics')}
              />
            </div>
          </Suspense>
        );

      case 'digest':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <DigestDashboard
                context={context}
                onBack={() => handleTabChange('analytics')}
              />
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
                onSelectIdea={handleSelectIdea}
              />
            </div>
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <div className="hub-page" data-context={context}>
      <PageHeader
        title="Insights"
        icon="📊"
        subtitle="Deine Gedanken im Überblick"
        onBack={onBack}
        backLabel="Zurück"
      />

      {/* Tab Navigation */}
      <nav className="hub-tabs" role="tablist" aria-label="Insights Navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            className={`hub-tab neuro-hover-lift neuro-focus-ring ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            aria-label={`${tab.label}: ${tab.description}`}
          >
            <span className="hub-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="hub-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="hub-content"
      >
        {renderTabContent()}
      </main>
    </div>
  );
};

export const InsightsDashboard = memo(InsightsDashboardComponent);
export default InsightsDashboard;
