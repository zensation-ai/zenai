/**
 * AIWorkshop - KI-Werkstatt (Konsolidierte KI-Features)
 *
 * Kombiniert die ehemaligen separaten Seiten:
 * - Inkubator (Gedanken-Cluster und Konsolidierung)
 * - Proaktiv (KI-Vorschläge und Routinen)
 * - Evolution (Gedanken-Entwicklung über Zeit)
 *
 * Neurowissenschaftliche Optimierungen:
 * - Tab-basierte Navigation für klare Struktur
 * - Progressive Disclosure der KI-Funktionen
 * - Einheitliches Interface für alle KI-Features
 */

import React, { Suspense, lazy, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import '../neurodesign.css';
import './shared-tabs.css';
import './AIWorkshop.css';

// Lazy-load die Sub-Komponenten
const ProactiveDashboard = lazy(() => import('./ProactiveDashboard').then(m => ({ default: m.ProactiveDashboard })));
const EvolutionDashboard = lazy(() => import('./EvolutionDashboard').then(m => ({ default: m.EvolutionDashboard })));
const AgentTeamsPage = lazy(() => import('./AgentTeamsPage').then(m => ({ default: m.AgentTeamsPage })));

type WorkshopTab = 'proactive' | 'evolution' | 'agent-teams';

interface AIWorkshopProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: WorkshopTab;
}

const TABS: { id: WorkshopTab; label: string; icon: string; description: string }[] = [
  { id: 'proactive', label: 'Vorschlaege', icon: '✨', description: 'KI-generierte Ideen und Routinen' },
  { id: 'evolution', label: 'Entwicklung', icon: '🌱', description: 'Wie deine Gedanken sich entwickeln' },
  { id: 'agent-teams', label: 'Agenten', icon: '👥', description: 'Multi-Agenten fuer komplexe Aufgaben' },
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
              <ProactiveDashboard
                context={context}
                onBack={() => handleTabChange('proactive')}
              />
            </div>
          </Suspense>
        );

      case 'evolution':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <EvolutionDashboard
                context={context}
                onBack={() => handleTabChange('proactive')}
              />
            </div>
          </Suspense>
        );

      case 'agent-teams':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content hub-tab-fullwidth">
              <AgentTeamsPage
                context={context}
                onBack={() => handleTabChange('proactive')}
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
        title="Werkstatt"
        icon="🧪"
        subtitle="KI-Tools die fuer dich arbeiten"
        onBack={onBack}
        backLabel="Zurück"
      />

      {/* Tab Navigation */}
      <nav className="hub-tabs" role="tablist" aria-label="KI-Werkstatt Navigation">
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

export const AIWorkshop = memo(AIWorkshopComponent);
export default AIWorkshop;
