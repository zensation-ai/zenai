/**
 * BusinessDashboard - AI Business Manager
 *
 * Tab-basiertes Dashboard für Business Intelligence.
 * Uses HubPage for unified layout.
 *
 * React Query hooks available via `hooks/queries/index.ts` for future migration:
 * - useDashboardSummary, useDashboardStats (from useDashboard)
 * Child tab components handle their own data fetching.
 */

import React, { Suspense, lazy, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import { HubPage, type TabDef } from './HubPage';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import type { BusinessTab } from '../types/business';
import './BusinessDashboard.css';

const BusinessOverview = lazy(() => import('./business/BusinessOverview').then(m => ({ default: m.BusinessOverview })));
const RevenueDashboard = lazy(() => import('./business/RevenueDashboard').then(m => ({ default: m.RevenueDashboard })));
const TrafficDashboard = lazy(() => import('./business/TrafficDashboard').then(m => ({ default: m.TrafficDashboard })));
const SeoDashboard = lazy(() => import('./business/SeoDashboard').then(m => ({ default: m.SeoDashboard })));
const HealthDashboard = lazy(() => import('./business/HealthDashboard').then(m => ({ default: m.HealthDashboard })));
const BusinessReports = lazy(() => import('./business/BusinessReports').then(m => ({ default: m.BusinessReports })));
const BusinessInsightsTab = lazy(() => import('./business/BusinessInsightsTab').then(m => ({ default: m.BusinessInsightsTab })));
const ConnectorSettings = lazy(() => import('./business/ConnectorSettings').then(m => ({ default: m.ConnectorSettings })));
const BusinessNarrativeTab = lazy(() => import('./BusinessNarrative/BusinessNarrative').then(m => ({ default: m.BusinessNarrative })));

interface BusinessDashboardProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: BusinessTab;
}

const TABS: readonly TabDef<BusinessTab>[] = [
  { id: 'overview', label: 'Übersicht', icon: '📊', description: 'KPI-Dashboard' },
  { id: 'revenue', label: 'Revenue', icon: '💰', description: 'Umsatz und Subscriptions' },
  { id: 'traffic', label: 'Traffic', icon: '🌐', description: 'Besucher und Analytics' },
  { id: 'seo', label: 'SEO', icon: '🔍', description: 'Suchmaschinen-Performance' },
  { id: 'health', label: 'Health', icon: '🏥', description: 'Uptime und Performance' },
  { id: 'insights', label: 'Insights', icon: '💡', description: 'AI-generierte Erkenntnisse' },
  { id: 'reports', label: 'Reports', icon: '📋', description: 'AI-generierte Berichte' },
  { id: 'connectors', label: 'Connectors', icon: '🔗', description: 'Datenquellen verwalten' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠', description: 'Cross-Context Business Narrative' },
];

const TabLoader = () => (
  <div className="hub-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const BusinessDashboardComponent: React.FC<BusinessDashboardProps> = ({
  context,
  onBack,
  initialTab = 'overview',
}) => {
  const { activeTab, handleTabChange } = useTabNavigation<BusinessTab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'overview',
    basePath: '/business',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Suspense fallback={<TabLoader />}>
            <BusinessOverview onNavigateTab={handleTabChange} />
          </Suspense>
        );
      case 'revenue':
        return (
          <Suspense fallback={<TabLoader />}>
            <RevenueDashboard />
          </Suspense>
        );
      case 'traffic':
        return (
          <Suspense fallback={<TabLoader />}>
            <TrafficDashboard />
          </Suspense>
        );
      case 'seo':
        return (
          <Suspense fallback={<TabLoader />}>
            <SeoDashboard />
          </Suspense>
        );
      case 'health':
        return (
          <Suspense fallback={<TabLoader />}>
            <HealthDashboard />
          </Suspense>
        );
      case 'insights':
        return (
          <Suspense fallback={<TabLoader />}>
            <BusinessInsightsTab />
          </Suspense>
        );
      case 'reports':
        return (
          <Suspense fallback={<TabLoader />}>
            <BusinessReports />
          </Suspense>
        );
      case 'connectors':
        return (
          <Suspense fallback={<TabLoader />}>
            <ConnectorSettings />
          </Suspense>
        );
      case 'intelligence':
        return (
          <Suspense fallback={<TabLoader />}>
            <BusinessNarrativeTab context={context} />
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Business Manager"
      icon="💼"
      subtitle="AI-gesteuerte Geschäftsanalysen"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      ariaLabel="Business Navigation"
    >
      {renderTabContent()}
    </HubPage>
  );
};

export const BusinessDashboard = memo(BusinessDashboardComponent);
