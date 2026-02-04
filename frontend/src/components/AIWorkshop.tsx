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

import React, { useState, useEffect, Suspense, lazy, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import { getBreadcrumbs } from './Breadcrumbs';
import { SkeletonLoader } from './SkeletonLoader';
import '../neurodesign.css';
import './AIWorkshop.css';

// Lazy-load die Sub-Komponenten
const IncubatorPage = lazy(() => import('./IncubatorPage').then(m => ({ default: m.IncubatorPage })));
const ProactiveDashboard = lazy(() => import('./ProactiveDashboard').then(m => ({ default: m.ProactiveDashboard })));
const EvolutionDashboard = lazy(() => import('./EvolutionDashboard').then(m => ({ default: m.EvolutionDashboard })));

type WorkshopTab = 'incubator' | 'proactive' | 'evolution';

interface AIWorkshopProps {
  context: 'personal' | 'work';
  onBack: () => void;
  onNavigate?: (page: string) => void;
  onIdeaCreated?: (ideaId: string) => void;
  initialTab?: WorkshopTab;
}

const TABS: { id: WorkshopTab; label: string; icon: string; description: string }[] = [
  { id: 'incubator', label: 'Inkubator', icon: '🧠', description: 'Gedanken reifen lassen und konsolidieren' },
  { id: 'proactive', label: 'Vorschläge', icon: '✨', description: 'KI-generierte Ideen und Routinen' },
  { id: 'evolution', label: 'Entwicklung', icon: '🌱', description: 'Wie deine Gedanken sich entwickeln' },
];

const TabLoader = () => (
  <div className="workshop-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const AIWorkshopComponent: React.FC<AIWorkshopProps> = ({
  context,
  onBack,
  onNavigate,
  onIdeaCreated,
  initialTab = 'incubator',
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<WorkshopTab>(initialTab);

  // Sync activeTab when initialTab prop changes (e.g., from URL navigation)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Update URL when tab changes (for browser history support)
  const handleTabChange = useCallback((tab: WorkshopTab) => {
    setActiveTab(tab);
    // Update URL to reflect current tab (e.g., /ai-workshop/proactive)
    navigate(`/ai-workshop/${tab}`, { replace: true });
  }, [navigate]);

  const handleIdeaCreated = (ideaId: string) => {
    if (onIdeaCreated) {
      onIdeaCreated(ideaId);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'incubator':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="workshop-tab-content">
              <IncubatorPage
                onBack={() => handleTabChange('incubator')}
                onIdeaCreated={handleIdeaCreated}
              />
            </div>
          </Suspense>
        );

      case 'proactive':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="workshop-tab-content workshop-tab-fullwidth">
              <ProactiveDashboard
                context={context}
                onBack={() => handleTabChange('incubator')}
              />
            </div>
          </Suspense>
        );

      case 'evolution':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="workshop-tab-content workshop-tab-fullwidth">
              <EvolutionDashboard
                context={context}
                onBack={() => handleTabChange('incubator')}
              />
            </div>
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <div className="ai-workshop" data-context={context}>
      <PageHeader
        title="KI-Werkstatt"
        icon="🧠"
        subtitle="Lass deine Gedanken mit KI wachsen"
        onBack={onBack}
        backLabel="Zurück"
        breadcrumbs={getBreadcrumbs('ai-workshop')}
        onNavigate={onNavigate ? (page) => onNavigate(page) : undefined}
      />

      {/* Tab Navigation */}
      <nav className="workshop-tabs liquid-glass-nav" role="tablist" aria-label="KI-Werkstatt Navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            className={`workshop-tab neuro-hover-lift neuro-focus-ring ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            aria-label={`${tab.label}: ${tab.description}`}
          >
            <span className="workshop-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="workshop-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="workshop-content"
      >
        {renderTabContent()}
      </main>
    </div>
  );
};

export const AIWorkshop = memo(AIWorkshopComponent);
export default AIWorkshop;
