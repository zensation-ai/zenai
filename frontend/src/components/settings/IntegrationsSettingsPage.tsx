/**
 * IntegrationsSettingsPage - Integrationen & Erweiterungen
 *
 * Tabs: integrations, mcp-servers, extensions
 */

import { memo, Suspense, lazy } from 'react';
import { AIContext } from '../ContextSwitcher';
import { HubPage, type TabDef } from '../HubPage';
import { SkeletonLoader } from '../SkeletonLoader';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import type { Page } from '../../types';

const IntegrationsPage = lazy(() => import('../IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const MCPConnectionsPage = lazy(() => import('../MCPConnectionsPage').then(m => ({ default: m.MCPConnectionsPage })));
const ExtensionMarketplace = lazy(() => import('../ExtensionMarketplace/ExtensionMarketplace').then(m => ({ default: m.ExtensionMarketplace })));
const PlatformSettings = lazy(() => import('../SocialMediaPage/PlatformSettings').then(m => ({ default: m.PlatformSettings })));

type IntegrationTab = 'integrations' | 'mcp-servers' | 'extensions' | 'social';

interface IntegrationsSettingsPageProps {
  context: AIContext;
  onBack: () => void;
  onNavigate: (page: Page) => void;
  initialTab?: IntegrationTab;
}

const TABS: readonly TabDef<IntegrationTab>[] = [
  { id: 'integrations', label: 'Integrationen', icon: '🔗', description: 'OAuth, API Keys, Webhooks' },
  { id: 'mcp-servers', label: 'MCP Server', icon: '🔌', description: 'Externe MCP-Verbindungen' },
  { id: 'extensions', label: 'Extensions', icon: '🧩', description: 'Erweiterungen und Plugins' },
  { id: 'social', label: 'Social Media', icon: '📣', description: 'Twitter, LinkedIn, Discord' },
];

const TabLoader = () => (
  <div className="py-4">
    <SkeletonLoader type="card" count={3} />
  </div>
);

export const IntegrationsSettingsPage = memo(({
  context,
  onBack,
  onNavigate,
  initialTab = 'integrations',
}: IntegrationsSettingsPageProps) => {
  const { activeTab, handleTabChange } = useTabNavigation<IntegrationTab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'integrations',
    basePath: '/system/integrationen',
    rootTab: 'integrations',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'integrations':
        return (
          <Suspense fallback={<TabLoader />}>
            <IntegrationsPage onBack={() => handleTabChange('integrations')} embedded />
          </Suspense>
        );

      case 'mcp-servers':
        return (
          <Suspense fallback={<TabLoader />}>
            <MCPConnectionsPage context={context} />
          </Suspense>
        );

      case 'extensions':
        return (
          <Suspense fallback={<TabLoader />}>
            <ExtensionMarketplace />
          </Suspense>
        );

      case 'social':
        return (
          <Suspense fallback={<TabLoader />}>
            <PlatformSettings />
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Integrationen"
      icon="🔗"
      subtitle="Verbindungen, MCP und Erweiterungen"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      onNavigate={onNavigate}
      ariaLabel="Integrations-Einstellungen"
    >
      {renderTabContent()}
    </HubPage>
  );
});

IntegrationsSettingsPage.displayName = 'IntegrationsSettingsPage';
