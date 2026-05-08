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
import { ErrorBoundary } from './ErrorBoundary';
import { useTabNavigation } from '../hooks/useTabNavigation';
import type { BusinessTab } from '../types/business';
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
  { id: 'revenue', label: 'Umsatz', icon: '💰', description: 'Umsatz und Subscriptions' },
  { id: 'traffic', label: 'Besucher', icon: '🌐', description: 'Besucher und Analytics' },
  { id: 'seo', label: 'SEO', icon: '🔍', description: 'Suchmaschinen-Performance' },
  { id: 'health', label: 'Zustand', icon: '🏥', description: 'Uptime und Performance' },
  { id: 'insights', label: 'Erkenntnisse', icon: '💡', description: 'AI-generierte Erkenntnisse' },
  { id: 'reports', label: 'Berichte', icon: '📋', description: 'AI-generierte Berichte' },
  { id: 'connectors', label: 'Verbindungen', icon: '🔗', description: 'Datenquellen verwalten' },
  { id: 'intelligence', label: 'Intelligenz', icon: '🧠', description: 'Cross-Context Business Narrative' },
];

const TabLoader = () => (
  <div className="hub-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

const TabErrorFallback = () => (
  <div className="hub-tab-loader text-text-secondary text-sm p-8 text-center">
    Inhalt konnte nicht geladen werden.
  </div>
);

function LazyTab({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary fallback={<TabErrorFallback />}>
      <Suspense fallback={<TabLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

const BusinessDashboardComponent: React.FC<BusinessDashboardProps> = ({
  context,
  onBack,
  initialTab = 'overview',
}) => {
  const { activeTab, handleTabChange } = useTabNavigation<BusinessTab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'overview',
    basePath: '/cockpit',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <LazyTab><BusinessOverview onNavigateTab={handleTabChange} /></LazyTab>;
      case 'revenue':
        return <LazyTab><RevenueDashboard /></LazyTab>;
      case 'traffic':
        return <LazyTab><TrafficDashboard /></LazyTab>;
      case 'seo':
        return <LazyTab><SeoDashboard /></LazyTab>;
      case 'health':
        return <LazyTab><HealthDashboard /></LazyTab>;
      case 'insights':
        return <LazyTab><BusinessInsightsTab /></LazyTab>;
      case 'reports':
        return <LazyTab><BusinessReports /></LazyTab>;
      case 'connectors':
        return <LazyTab><ConnectorSettings /></LazyTab>;
      case 'intelligence':
        return <LazyTab><BusinessNarrativeTab context={context} /></LazyTab>;
      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Geschäftscockpit"
      icon="💼"
      subtitle="AI-gesteuerte Geschäftsanalysen"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      ariaLabel="Geschäftscockpit Navigation"
    >
      {renderTabContent()}
    </HubPage>
  );
};

export const BusinessDashboard = memo(BusinessDashboardComponent);
