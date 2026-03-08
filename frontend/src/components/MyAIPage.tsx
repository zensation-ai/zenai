/**
 * MyAIPage - Meine KI
 *
 * Tabs: KI anpassen, KI-Wissen, Sprach-Chat
 */

import React, { Suspense, lazy, memo } from 'react';
import type { AIContext } from './ContextSwitcher';
import { HubPage, type TabDef } from './HubPage';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';

const PersonalizationChat = lazy(() => import('./PersonalizationChat').then(m => ({ default: m.PersonalizationChat })));
const MemoryTransparency = lazy(() => import('./MemoryTransparency').then(m => ({ default: m.MemoryTransparency })));
const VoiceChat = lazy(() => import('./VoiceChat').then(m => ({ default: m.VoiceChat })));

type MyAITab = 'personalize' | 'memory' | 'voice-chat';

interface MyAIPageProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: MyAITab;
}

const TABS: TabDef<MyAITab>[] = [
  { id: 'personalize', label: 'KI anpassen', icon: '🎨', description: 'Deine KI kennenlernen und trainieren' },
  { id: 'memory', label: 'KI-Wissen', icon: '🧠', description: 'Was deine KI über dich gelernt hat' },
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
              <PersonalizationChat context={context} embedded />
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
    <HubPage
      title="Meine KI"
      icon="🤖"
      subtitle="Personalisierung, KI-Wissen und Sprach-Chat"
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

export const MyAIPage = memo(MyAIPageComponent);
