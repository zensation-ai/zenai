/**
 * MyAIPage - Meine KI
 *
 * Tabs: KI anpassen, KI-Wissen, Sprach-Chat
 *
 * React Query hooks available via `hooks/queries/index.ts` for future migration.
 * Child tab components (PersonalizationChat, MemoryTransparency, VoiceChat)
 * handle their own data fetching.
 */

import React, { Suspense, lazy, memo } from 'react';
import type { AIContext } from './ContextSwitcher';
import { HubPage, type TabDef } from './HubPage';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';

const PersonalizationChat = lazy(() => import('./PersonalizationChat').then(m => ({ default: m.PersonalizationChat })));
const MemoryTransparency = lazy(() => import('./MemoryTransparency').then(m => ({ default: m.MemoryTransparency })));
const VoiceChat = lazy(() => import('./VoiceChat/VoiceChat').then(m => ({ default: m.VoiceChat })));
const VoiceSettings = lazy(() => import('./VoiceChat/VoiceSettings').then(m => ({ default: m.VoiceSettings })));
const ProceduralMemoryPanel = lazy(() => import('./ProceduralMemoryPanel').then(m => ({ default: m.ProceduralMemoryPanel })));
const DigitalTwinPage = lazy(() => import('./DigitalTwinPage/DigitalTwinPage').then(m => ({ default: m.DigitalTwinPage })));

type MyAITab = 'personalize' | 'memory' | 'procedures' | 'digital-twin' | 'voice-chat';

interface MyAIPageProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: MyAITab;
}

const TABS: TabDef<MyAITab>[] = [
  { id: 'personalize', label: 'KI anpassen', icon: '🎨', description: 'Deine KI kennenlernen und trainieren' },
  { id: 'memory', label: 'KI-Wissen', icon: '🧠', description: 'Was deine KI über dich gelernt hat' },
  { id: 'procedures', label: 'Prozeduren', icon: '📋', description: 'Gelernte Vorgehensweisen und Hybrid-Suche' },
  { id: 'digital-twin', label: 'Digital Twin', icon: '🪞', description: 'Dein KI-Profil und Persoenlichkeitsradar' },
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
    validTabs: ['personalize', 'memory', 'procedures', 'digital-twin', 'voice-chat'],
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
      case 'procedures':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <ProceduralMemoryPanel context={context} />
            </div>
          </Suspense>
        );
      case 'digital-twin':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <DigitalTwinPage context={context} />
            </div>
          </Suspense>
        );
      case 'voice-chat':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <VoiceSettings context={context} />
              <VoiceChat
                context={context}
                onClose={() => handleTabChange('personalize')}
                embedded
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
