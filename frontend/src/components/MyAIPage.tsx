/**
 * MyAIPage - Meine KI (Personalisierung + Memory + Sprach-Chat)
 *
 * Kombiniert PersonalizationChat, MemoryTransparency und VoiceChat
 * in einer Seite mit Tab-Navigation.
 */

import React, { Suspense, lazy, memo } from 'react';
import type { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import '../neurodesign.css';
import './shared-tabs.css';

const PersonalizationChat = lazy(() => import('./PersonalizationChat').then(m => ({ default: m.PersonalizationChat })));
const MemoryTransparency = lazy(() => import('./MemoryTransparency').then(m => ({ default: m.MemoryTransparency })));
const VoiceChat = lazy(() => import('./VoiceChat').then(m => ({ default: m.VoiceChat })));

type MyAITab = 'personalize' | 'memory' | 'voice-chat';

interface MyAIPageProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: MyAITab;
}

const TABS: { id: MyAITab; label: string; icon: string; description: string }[] = [
  { id: 'personalize', label: 'KI anpassen', icon: '🎨', description: 'Deine KI kennenlernen und trainieren' },
  { id: 'memory', label: 'KI-Wissen', icon: '🧠', description: 'Was deine KI ueber dich gelernt hat' },
  { id: 'voice-chat', label: 'Sprach-Chat', icon: '🎙️', description: 'Echtzeit-Sprachgespraech mit KI' },
];

const TabLoader = () => (
  <div className="hub-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const MyAIPageComponent: React.FC<MyAIPageProps> = ({
  context,
  onBack,
  initialTab = 'personalize',
}) => {
  const { activeTab, handleTabChange } = useTabNavigation<MyAITab>({
    initialTab,
    validTabs: ['personalize', 'memory', 'voice-chat'],
    defaultTab: 'personalize',
    basePath: '/my-ai',
    rootTab: 'personalize',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'personalize':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
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
            <div className="hub-tab-content">
              <MemoryTransparency context={context} />
            </div>
          </Suspense>
        );

      case 'voice-chat':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
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
    <div className="hub-page" data-context={context}>
      <PageHeader
        title="Meine KI"
        icon="🤖"
        subtitle="Personalisierung, KI-Wissen und Sprach-Chat"
        onBack={onBack}
        backLabel="Zurueck"
      />

      <nav className="hub-tabs" role="tablist" aria-label="Meine KI Navigation">
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

export const MyAIPage = memo(MyAIPageComponent);
