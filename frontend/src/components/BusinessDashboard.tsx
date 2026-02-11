/**
 * BusinessDashboard - AI Business Manager
 *
 * Tab-basiertes Dashboard fuer Business Intelligence:
 * - Overview: KPI-Cards mit Sparklines
 * - Revenue: Stripe MRR, Subscriptions, Payments
 * - Traffic: GA4 Users, Sessions, Sources
 * - SEO: GSC Impressions, Clicks, Rankings
 * - Health: Uptime, Performance, Web Vitals
 * - Reports: AI-generierte Berichte
 * - Connectors: Datenquellen verwalten
 */

import React, { Suspense, lazy, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import type { BusinessTab } from '../types/business';
import '../neurodesign.css';
import './shared-tabs.css';
import './BusinessDashboard.css';

const BusinessOverview = lazy(() => import('./business/BusinessOverview').then(m => ({ default: m.BusinessOverview })));
const RevenueDashboard = lazy(() => import('./business/RevenueDashboard').then(m => ({ default: m.RevenueDashboard })));
const TrafficDashboard = lazy(() => import('./business/TrafficDashboard').then(m => ({ default: m.TrafficDashboard })));
const SeoDashboard = lazy(() => import('./business/SeoDashboard').then(m => ({ default: m.SeoDashboard })));
const HealthDashboard = lazy(() => import('./business/HealthDashboard').then(m => ({ default: m.HealthDashboard })));
const BusinessReports = lazy(() => import('./business/BusinessReports').then(m => ({ default: m.BusinessReports })));
const BusinessInsightsTab = lazy(() => import('./business/BusinessInsightsTab').then(m => ({ default: m.BusinessInsightsTab })));
const ConnectorSettings = lazy(() => import('./business/ConnectorSettings').then(m => ({ default: m.ConnectorSettings })));

interface BusinessDashboardProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: BusinessTab;
}

const TABS: { id: BusinessTab; label: string; icon: string; description: string }[] = [
  { id: 'overview', label: 'Uebersicht', icon: '📊', description: 'KPI-Dashboard' },
  { id: 'revenue', label: 'Revenue', icon: '💰', description: 'Umsatz und Subscriptions' },
  { id: 'traffic', label: 'Traffic', icon: '🌐', description: 'Besucher und Analytics' },
  { id: 'seo', label: 'SEO', icon: '🔍', description: 'Suchmaschinen-Performance' },
  { id: 'health', label: 'Health', icon: '🏥', description: 'Uptime und Performance' },
  { id: 'insights', label: 'Insights', icon: '💡', description: 'AI-generierte Erkenntnisse' },
  { id: 'reports', label: 'Reports', icon: '📋', description: 'AI-generierte Berichte' },
  { id: 'connectors', label: 'Connectors', icon: '🔗', description: 'Datenquellen verwalten' },
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
            <BusinessOverview context={context} onNavigateTab={handleTabChange} />
          </Suspense>
        );
      case 'revenue':
        return (
          <Suspense fallback={<TabLoader />}>
            <RevenueDashboard context={context} />
          </Suspense>
        );
      case 'traffic':
        return (
          <Suspense fallback={<TabLoader />}>
            <TrafficDashboard context={context} />
          </Suspense>
        );
      case 'seo':
        return (
          <Suspense fallback={<TabLoader />}>
            <SeoDashboard context={context} />
          </Suspense>
        );
      case 'health':
        return (
          <Suspense fallback={<TabLoader />}>
            <HealthDashboard context={context} />
          </Suspense>
        );
      case 'insights':
        return (
          <Suspense fallback={<TabLoader />}>
            <BusinessInsightsTab context={context} />
          </Suspense>
        );
      case 'reports':
        return (
          <Suspense fallback={<TabLoader />}>
            <BusinessReports context={context} />
          </Suspense>
        );
      case 'connectors':
        return (
          <Suspense fallback={<TabLoader />}>
            <ConnectorSettings context={context} />
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <div className="hub-page" data-context={context}>
      <PageHeader
        title="Business Manager"
        icon="💼"
        subtitle="AI-gesteuerte Geschaeftsanalysen"
        onBack={onBack}
        backLabel="Zurueck"
      />

      <nav className="hub-tabs" role="tablist" aria-label="Business Navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`biz-tab-${tab.id}`}
            type="button"
            role="tab"
            className={`hub-tab neuro-hover-lift neuro-focus-ring ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={`biz-tabpanel-${tab.id}`}
            aria-label={`${tab.label}: ${tab.description}`}
          >
            <span className="hub-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="hub-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main
        id={`biz-tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`biz-tab-${activeTab}`}
        className="business-content"
      >
        {renderTabContent()}
      </main>
    </div>
  );
};

export const BusinessDashboard = memo(BusinessDashboardComponent);
