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

import React, { useState, useEffect, Suspense, lazy, memo } from 'react';
import { PageHeader } from './PageHeader';
import { getBreadcrumbs } from './Breadcrumbs';
import { SkeletonLoader } from './SkeletonLoader';
import '../neurodesign.css';
import './InsightsDashboard.css';

// Lazy-load die Sub-Komponenten für bessere Performance
const DashboardHome = lazy(() => import('./DashboardHome').then(m => ({ default: m.DashboardHome })));
const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const DigestDashboard = lazy(() => import('./DigestDashboard').then(m => ({ default: m.DigestDashboard })));
const KnowledgeGraphPage = lazy(() => import('./KnowledgeGraph/KnowledgeGraphPage'));

type InsightsTab = 'overview' | 'analytics' | 'digest' | 'connections';

interface InsightsDashboardProps {
  context: 'personal' | 'work';
  onBack: () => void;
  onNavigate?: (page: string) => void;
  onSelectIdea?: (ideaId: string) => void;
  initialTab?: InsightsTab;
}

const TABS: { id: InsightsTab; label: string; icon: string; description: string }[] = [
  { id: 'overview', label: 'Übersicht', icon: '🏠', description: 'Dashboard mit wichtigsten Metriken' },
  { id: 'analytics', label: 'Statistiken', icon: '📈', description: 'Detaillierte Analysen und Trends' },
  { id: 'digest', label: 'Zusammenfassung', icon: '📊', description: 'Tägliche und wöchentliche Digests' },
  { id: 'connections', label: 'Verbindungen', icon: '🕸️', description: 'Wissens-Graph und Beziehungen' },
];

const TabLoader = () => (
  <div className="insights-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const InsightsDashboardComponent: React.FC<InsightsDashboardProps> = ({
  context,
  onBack,
  onNavigate,
  onSelectIdea,
  initialTab = 'overview',
}) => {
  const [activeTab, setActiveTab] = useState<InsightsTab>(initialTab);

  // Sync activeTab when initialTab prop changes (e.g., from legacy navigation)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleNavigate = (page: string) => {
    // Mapping für interne Tab-Switches (falls jemand 'analytics' etc. aufruft)
    const tabMapping: Record<string, InsightsTab> = {
      'dashboard': 'overview',
      'analytics': 'analytics',
      'digest': 'digest',
      'knowledge-graph': 'connections',
    };

    // Wenn es ein interner Tab ist, wechsle den Tab statt zu navigieren
    if (tabMapping[page]) {
      setActiveTab(tabMapping[page]);
      return;
    }

    // Ansonsten normale Navigation zur App-Ebene
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const handleSelectIdea = (ideaId: string) => {
    if (onSelectIdea) {
      onSelectIdea(ideaId);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="insights-tab-content">
              <DashboardHome
                context={context}
                apiBase="/api"
                onNavigate={handleNavigate}
                showToast={() => {}}
              />
            </div>
          </Suspense>
        );

      case 'analytics':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="insights-tab-content insights-tab-fullwidth">
              <AnalyticsDashboard
                context={context}
                onBack={() => setActiveTab('overview')}
              />
            </div>
          </Suspense>
        );

      case 'digest':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="insights-tab-content insights-tab-fullwidth">
              <DigestDashboard
                context={context}
                onBack={() => setActiveTab('overview')}
              />
            </div>
          </Suspense>
        );

      case 'connections':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="insights-tab-content insights-tab-fullheight">
              <KnowledgeGraphPage
                context={context}
                onBack={() => setActiveTab('overview')}
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
    <div className="insights-dashboard" data-context={context}>
      <PageHeader
        title="Insights"
        icon="📊"
        subtitle="Deine Gedanken im Überblick"
        onBack={onBack}
        backLabel="Zurück"
        breadcrumbs={getBreadcrumbs('insights')}
        onNavigate={onNavigate ? (page) => onNavigate(page) : undefined}
      />

      {/* Tab Navigation */}
      <nav className="insights-tabs liquid-glass-nav" role="tablist" aria-label="Insights Navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            className={`insights-tab neuro-hover-lift neuro-focus-ring ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            aria-label={`${tab.label}: ${tab.description}`}
          >
            <span className="insights-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="insights-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="insights-content"
      >
        {renderTabContent()}
      </main>
    </div>
  );
};

export const InsightsDashboard = memo(InsightsDashboardComponent);
export default InsightsDashboard;
