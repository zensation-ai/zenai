/**
 * AdminSettingsPage - Administration & System
 *
 * Tabs: governance, security, team, system
 */

import { memo, Suspense, lazy } from 'react';
import { AIContext } from '../ContextSwitcher';
import { HubPage, type TabDef } from '../HubPage';
import { SkeletonLoader } from '../SkeletonLoader';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import type { Page } from '../../types';

const GovernanceDashboard = lazy(() => import('../GovernanceDashboard').then(m => ({ default: m.GovernanceDashboard })));
const SecurityAuditPanel = lazy(() => import('../SecurityAuditPanel').then(m => ({ default: m.SecurityAuditPanel })));
const ObservabilityPanel = lazy(() => import('../ObservabilityPanel').then(m => ({ default: m.ObservabilityPanel })));
const TeamTab = lazy(() => import('./TeamTab').then(m => ({ default: m.TeamTab })));
const VoiceTab = lazy(() => import('../SystemAdminPage/VoiceTab').then(m => ({ default: m.VoiceTab })));

type AdminTab = 'governance' | 'security' | 'team' | 'system' | 'voice';

interface AdminSettingsPageProps {
  context: AIContext;
  onBack: () => void;
  onNavigate: (page: Page) => void;
  initialTab?: AdminTab;
}

const TABS: readonly TabDef<AdminTab>[] = [
  { id: 'governance', label: 'Governance', icon: '🛡️', description: 'Genehmigungen, Audit-Trail, Richtlinien' },
  { id: 'team', label: 'Team', icon: '👥', description: 'Mitglieder, Rollen und Einladungen' },
  { id: 'security', label: 'Sicherheit', icon: '🔒', description: 'Audit-Log und Rate Limits' },
  { id: 'system', label: 'System', icon: '📡', description: 'Health, Queues und Metriken' },
  { id: 'voice', label: 'Voice', icon: '🎙️', description: 'Voice-Pipeline Latenz und Provider' },
];

const TabLoader = () => (
  <div className="py-4">
    <SkeletonLoader type="card" count={3} />
  </div>
);

export const AdminSettingsPage = memo(({
  context,
  onBack,
  onNavigate,
  initialTab = 'governance',
}: AdminSettingsPageProps) => {
  const { activeTab, handleTabChange } = useTabNavigation<AdminTab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'governance',
    basePath: '/system/admin',
    rootTab: 'governance',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'governance':
        return (
          <Suspense fallback={<TabLoader />}>
            <GovernanceDashboard context={context} />
          </Suspense>
        );

      case 'team':
        return (
          <Suspense fallback={<TabLoader />}>
            <TeamTab />
          </Suspense>
        );

      case 'security':
        return (
          <Suspense fallback={<TabLoader />}>
            <SecurityAuditPanel />
          </Suspense>
        );

      case 'system':
        return (
          <Suspense fallback={<TabLoader />}>
            <ObservabilityPanel />
          </Suspense>
        );

      case 'voice':
        return (
          <Suspense fallback={<TabLoader />}>
            <VoiceTab />
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Administration"
      icon="🛡️"
      subtitle="Governance, Sicherheit und System"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      onNavigate={onNavigate}
      ariaLabel="Admin-Einstellungen"
    >
      {renderTabContent()}
    </HubPage>
  );
});

AdminSettingsPage.displayName = 'AdminSettingsPage';
