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
import { AIContext } from './ContextSwitcher';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import { SkeletonLoader } from './SkeletonLoader';
import '../neurodesign.css';
import './AIWorkshop.css';

// Lazy-load die Sub-Komponenten
const ProactiveDashboard = lazy(() => import('./ProactiveDashboard').then(m => ({ default: m.ProactiveDashboard })));
const EvolutionDashboard = lazy(() => import('./EvolutionDashboard').then(m => ({ default: m.EvolutionDashboard })));
const VoiceChat = lazy(() => import('./VoiceChat').then(m => ({ default: m.VoiceChat })));
const AgentTeamsPage = lazy(() => import('./AgentTeamsPage').then(m => ({ default: m.AgentTeamsPage })));

type WorkshopTab = 'proactive' | 'evolution' | 'voice-chat' | 'agent-teams';

interface AIWorkshopProps {
  context: AIContext;
  onBack: () => void;
  onNavigate?: (page: string) => void;
  onIdeaCreated?: (ideaId: string) => void;
  initialTab?: WorkshopTab;
}

const TABS: { id: WorkshopTab; label: string; icon: string; description: string }[] = [
  { id: 'proactive', label: 'Vorschläge', icon: '✨', description: 'KI-generierte Ideen und Routinen' },
  { id: 'evolution', label: 'Entwicklung', icon: '🌱', description: 'Wie deine Gedanken sich entwickeln' },
  { id: 'voice-chat', label: 'Sprach-Chat', icon: '🎙️', description: 'Echtzeit-Sprachgespräch mit KI' },
  { id: 'agent-teams', label: 'Agenten', icon: '👥', description: 'Multi-Agenten für komplexe Aufgaben' },
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
  onIdeaCreated: _onIdeaCreated,
  initialTab = 'proactive',
}) => {
  const navigate = useNavigate();
  const VALID_TABS: WorkshopTab[] = ['proactive', 'evolution', 'voice-chat', 'agent-teams'];
  const validatedTab = VALID_TABS.includes(initialTab as WorkshopTab) ? initialTab as WorkshopTab : 'proactive';
  const [activeTab, setActiveTab] = useState<WorkshopTab>(validatedTab);

  // Sync activeTab when initialTab prop changes (e.g., from URL navigation)
  useEffect(() => {
    setActiveTab(VALID_TABS.includes(initialTab as WorkshopTab) ? initialTab as WorkshopTab : 'proactive');
  }, [initialTab]);

  // Update URL when tab changes (for browser history support)
  const handleTabChange = useCallback((tab: WorkshopTab) => {
    setActiveTab(tab);
    // Update URL to reflect current tab (e.g., /ai-workshop/proactive)
    navigate(`/ai-workshop/${tab}`, { replace: true });
  }, [navigate]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'proactive':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="workshop-tab-content workshop-tab-fullwidth">
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
            <div className="workshop-tab-content workshop-tab-fullwidth">
              <EvolutionDashboard
                context={context}
                onBack={() => handleTabChange('proactive')}
              />
            </div>
          </Suspense>
        );

      case 'voice-chat':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="workshop-tab-content workshop-tab-fullwidth">
              <VoiceChat
                context={context}
                apiUrl={import.meta.env.VITE_API_URL || ''}
                apiKey={import.meta.env.VITE_API_KEY || ''}
                onClose={() => handleTabChange('proactive')}
              />
            </div>
          </Suspense>
        );

      case 'agent-teams':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="workshop-tab-content workshop-tab-fullwidth">
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
    <div className="ai-workshop" data-context={context}>
      <PageHeader
        title="KI-Werkstatt"
        icon="🧠"
        subtitle="Lass deine Gedanken mit KI wachsen"
        onBack={onBack}
        backLabel="Zurück"
        onNavigate={onNavigate ? (page) => onNavigate(page) : undefined}
      />

      {/* Tab Navigation */}
      <nav className="workshop-tabs" role="tablist" aria-label="KI-Werkstatt Navigation">
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
