/**
 * CockpitSmartPage - Main Cockpit container (Phase 109b)
 *
 * Thin wrapper that delegates to existing child components.
 * Assembles ViewToggle + TimeRangeChips + Suspense-wrapped view content.
 */
import { useState, useEffect, Suspense } from 'react';
import { ViewToggle } from './ViewToggle';
import { TimeRangeChips } from './TimeRangeChips';
import { SmartPageSkeleton } from '../skeletons/PageSkeletons';
import type { CockpitViewMode, TimeRange, CockpitSmartPageProps } from './types';
import './CockpitSmartPage.css';

/** Map initialTab string values → CockpitViewMode */
function resolveInitialView(tab: string | undefined): CockpitViewMode {
  if (!tab) return 'uebersicht';
  switch (tab) {
    case 'uebersicht':
    case 'overview':
      return 'uebersicht';
    case 'business':
      return 'business';
    case 'finanzen':
    case 'finance':
      return 'finanzen';
    case 'trends':
    case 'insights':
      return 'trends';
    default:
      return 'uebersicht';
  }
}

export function CockpitSmartPage({ context, initialTab }: CockpitSmartPageProps) {
  const [viewMode, setViewMode] = useState<CockpitViewMode>(() => resolveInitialView(initialTab));
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  // Sync initialTab changes (e.g., navigation from outside)
  useEffect(() => {
    if (initialTab) {
      setViewMode(resolveInitialView(initialTab));
    }
  }, [initialTab]);

  return (
    <div className="cockpit-smart-page" role="main" aria-label="Cockpit">
      <div className="cockpit-smart-page__toolbar">
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <TimeRangeChips value={timeRange} onChange={setTimeRange} />
      </div>

      <div className="cockpit-smart-page__content">
        <Suspense fallback={<SmartPageSkeleton />}>
          {viewMode === 'uebersicht' && (
            <div data-testid="cockpit-view-uebersicht" data-context={context} data-range={timeRange}>
              Übersicht
            </div>
          )}
          {viewMode === 'business' && (
            <div data-testid="cockpit-view-business" data-context={context} data-range={timeRange}>
              Business
            </div>
          )}
          {viewMode === 'finanzen' && (
            <div data-testid="cockpit-view-finanzen" data-context={context} data-range={timeRange}>
              Finanzen
            </div>
          )}
          {viewMode === 'trends' && (
            <div data-testid="cockpit-view-trends" data-context={context} data-range={timeRange}>
              Trends
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
