/**
 * MyAIPage - Meine KI (Personalisierung + Memory + Sprach-Chat)
 *
 * Kombiniert PersonalizationChat, MemoryTransparency und VoiceChat
 * in einer Seite mit Tab-Navigation.
 */

import React, { useState, useEffect, Suspense, lazy, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { SkeletonLoader } from './SkeletonLoader';
import '../neurodesign.css';
import './InsightsDashboard.css'; // Reuse tab styles

const PersonalizationChat = lazy(() => import('./PersonalizationChat').then(m => ({ default: m.PersonalizationChat })));
const MemoryTransparency = lazy(() => import('./MemoryTransparency').then(m => ({ default: m.MemoryTransparency })));
const VoiceChat = lazy(() => import('./VoiceChat').then(m => ({ default: m.VoiceChat })));

type MyAITab = 'personalize' | 'memory' | 'voice-chat';

interface MyAIPageProps {
  context: string;
  onBack: () => void;
  initialTab?: MyAITab;
}

const TABS: { id: MyAITab; label: string; icon: string; description: string }[] = [
  { id: 'personalize', label: 'KI anpassen', icon: '🎨', description: 'Deine KI kennenlernen und trainieren' },
  { id: 'memory', label: 'KI-Wissen', icon: '🧠', description: 'Was deine KI ueber dich gelernt hat' },
  { id: 'voice-chat', label: 'Sprach-Chat', icon: '🎙️', description: 'Echtzeit-Sprachgespraech mit KI' },
];

const TabLoader = () => (
  <div className="insights-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const MyAIPageComponent: React.FC<MyAIPageProps> = ({
  context,
  onBack,
  initialTab = 'personalize',
}) => {
  const navigate = useNavigate();
  const VALID_TABS: MyAITab[] = ['personalize', 'memory', 'voice-chat'];
  const validatedTab = VALID_TABS.includes(initialTab) ? initialTab : 'personalize';
  const [activeTab, setActiveTab] = useState<MyAITab>(validatedTab);

  useEffect(() => {
    setActiveTab(VALID_TABS.includes(initialTab as MyAITab) ? initialTab as MyAITab : 'personalize');
  }, [initialTab]);

  const handleTabChange = useCallback((tab: MyAITab) => {
    setActiveTab(tab);
    if (tab === 'personalize') {
      navigate('/my-ai', { replace: true });
    } else {
      navigate(`/my-ai/${tab}`, { replace: true });
    }
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

      case 'voice-chat':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="insights-tab-content">
              <VoiceChat
                context={context}
                apiUrl={import.meta.env.VITE_API_URL || ''}
                apiKey={import.meta.env.VITE_API_KEY || ''}
                onClose={() => handleTabChange('personalize')}
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
        title="Meine KI"
        icon="🤖"
        subtitle="Personalisierung, KI-Wissen und Sprach-Chat"
        onBack={onBack}
        backLabel="Zurueck"
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
