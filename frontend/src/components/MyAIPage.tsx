/**
 * MyAIPage - Meine KI (Personalisierung + Memory)
 *
 * Kombiniert PersonalizationChat und MemoryTransparency
 * in einer Seite mit Tab-Navigation.
 */

import React, { useState, Suspense, lazy, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { SkeletonLoader } from './SkeletonLoader';
import '../neurodesign.css';
import './InsightsDashboard.css'; // Reuse tab styles

const PersonalizationChat = lazy(() => import('./PersonalizationChat').then(m => ({ default: m.PersonalizationChat })));
const MemoryTransparency = lazy(() => import('./MemoryTransparency').then(m => ({ default: m.MemoryTransparency })));

type MyAITab = 'personalize' | 'memory';

interface MyAIPageProps {
  context: string;
  onBack: () => void;
}

const TABS: { id: MyAITab; label: string; icon: string; description: string }[] = [
  { id: 'personalize', label: 'KI anpassen', icon: '🎨', description: 'Deine KI kennenlernen und trainieren' },
  { id: 'memory', label: 'KI-Wissen', icon: '🧠', description: 'Was deine KI über dich gelernt hat' },
];

const TabLoader = () => (
  <div className="insights-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const MyAIPageComponent: React.FC<MyAIPageProps> = ({
  context,
  onBack,
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MyAITab>('personalize');

  const handleTabChange = useCallback((tab: MyAITab) => {
    setActiveTab(tab);
    navigate(`/my-ai/${tab}`, { replace: true });
  }, [navigate]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'personalize':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="insights-tab-content">
              <PersonalizationChat
                context={context}
                onBack={() => handleTabChange('personalize')}
              />
            </div>
          </Suspense>
        );

      case 'memory':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="insights-tab-content">
              <MemoryTransparency context={context as AIContext} />
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
        title="Meine KI"
        icon="🤖"
        subtitle="Personalisierung und KI-Wissen"
        onBack={onBack}
        backLabel="Zurück"
      />

      <div className="insights-tabs" role="tablist" aria-label="Meine KI Navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`insights-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            title={tab.description}
          >
            <span className="insights-tab-icon">{tab.icon}</span>
            <span className="insights-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="insights-content" role="tabpanel">
        {renderTabContent()}
      </div>
    </div>
  );
};

export const MyAIPage = memo(MyAIPageComponent);
