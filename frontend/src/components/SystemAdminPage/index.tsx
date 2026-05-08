/**
 * SystemAdminPage - System Administration Dashboard
 *
 * Combines Observability (Phase 61), Security Admin (Phase 62),
 * and Sleep Compute (Phase 63) into a single admin hub page.
 *
 * Tab components extracted into separate files (Phase 120).
 * Tabs: Übersicht, Job Queues, Sicherheit, Sleep Compute
 */

import React, { Suspense, memo } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { HubPage, type TabDef } from '../HubPage';
import { SkeletonLoader } from '../SkeletonLoader';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { OverviewTab } from './OverviewTab';
import { QueuesTab } from './QueuesTab';
import { SecurityTab } from './SecurityTab';
import { SleepComputeTab } from './SleepComputeTab';
import { BillingTab } from './BillingTab';
import { MarketplaceTab } from './MarketplaceTab';
import { VoiceTab } from './VoiceTab';

// ==========================================
// Types
// ==========================================

type AdminTab = 'overview' | 'queues' | 'security' | 'sleep' | 'billing' | 'marketplace' | 'voice';

interface SystemAdminPageProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: AdminTab;
}

// ==========================================
// Tab Definitions
// ==========================================

const TABS: TabDef<AdminTab>[] = [
  { id: 'overview', label: 'Übersicht', icon: '\u2699\uFE0F', description: 'System-Health und Metriken' },
  { id: 'queues', label: 'Job Queues', icon: '\uD83D\uDCE6', description: 'BullMQ Queue Monitoring' },
  { id: 'security', label: 'Sicherheit', icon: '\uD83D\uDD12', description: 'Audit Log und Security Alerts' },
  { id: 'sleep', label: 'Sleep Compute', icon: '\uD83C\uDF19', description: 'Sleep-Time Background Processing' },
  { id: 'billing', label: 'Billing', icon: '\uD83D\uDCB3', description: 'Stripe-Webhook Events und Replay' },
  { id: 'marketplace', label: 'Marketplace', icon: '\uD83C\uDFEA', description: 'Community-Agent Moderation' },
  { id: 'voice', label: 'Voice', icon: '\uD83C\uDF99\uFE0F', description: 'Voice-Pipeline Latenz und Provider' },
];

const TabLoader = () => (
  <div className="hub-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

// ==========================================
// Main Component
// ==========================================

const SystemAdminPageComponent: React.FC<SystemAdminPageProps> = ({
  context,
  onBack,
  initialTab = 'overview',
}) => {
  const { activeTab, handleTabChange } = useTabNavigation<AdminTab>({
    initialTab,
    validTabs: ['overview', 'queues', 'security', 'sleep', 'billing', 'marketplace', 'voice'],
    defaultTab: 'overview',
    basePath: '/admin',
    rootTab: 'overview',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <OverviewTab />
            </div>
          </Suspense>
        );
      case 'queues':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <QueuesTab />
            </div>
          </Suspense>
        );
      case 'security':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <SecurityTab />
            </div>
          </Suspense>
        );
      case 'sleep':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <SleepComputeTab context={context} />
            </div>
          </Suspense>
        );
      case 'billing':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <BillingTab />
            </div>
          </Suspense>
        );
      case 'marketplace':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <MarketplaceTab />
            </div>
          </Suspense>
        );
      case 'voice':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <VoiceTab />
            </div>
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <HubPage
      title="System Administration"
      icon="\u2699\uFE0F"
      subtitle="Observability, Security und Background Processing"
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

export const SystemAdminPage = memo(SystemAdminPageComponent);
