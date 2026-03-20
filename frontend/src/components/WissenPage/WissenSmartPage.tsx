/**
 * WissenSmartPage - Main Wissen (Knowledge) container (Phase 109a)
 *
 * Thin wrapper that delegates to existing child components.
 * Assembles ViewToggle + Suspense-wrapped view content.
 */
import { useState, useEffect, Suspense } from 'react';
import { ViewToggle } from './ViewToggle';
import { SmartPageSkeleton } from '../skeletons/PageSkeletons';
import type { WissenViewMode, WissenSmartPageProps } from './types';
import './WissenSmartPage.css';

/** Map initialTab string values → WissenViewMode */
function resolveInitialView(tab: string | undefined): WissenViewMode {
  if (!tab) return 'dokumente';
  switch (tab) {
    case 'dokumente':
    case 'documents':
      return 'dokumente';
    case 'canvas':
    case 'editor':
      return 'canvas';
    case 'medien':
    case 'media':
      return 'medien';
    case 'verbindungen':
    case 'connections':
    case 'insights':
      return 'verbindungen';
    case 'lernen':
    case 'learning':
      return 'lernen';
    default:
      return 'dokumente';
  }
}

export function WissenSmartPage({ context, initialTab }: WissenSmartPageProps) {
  const [viewMode, setViewMode] = useState<WissenViewMode>(() => resolveInitialView(initialTab));

  // Sync initialTab changes (e.g., navigation from outside)
  useEffect(() => {
    if (initialTab) {
      setViewMode(resolveInitialView(initialTab));
    }
  }, [initialTab]);

  return (
    <div className="wissen-smart-page" role="main" aria-label="Wissen">
      <div className="wissen-smart-page__toolbar">
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="wissen-smart-page__content">
        <Suspense fallback={<SmartPageSkeleton />}>
          {viewMode === 'dokumente' && (
            <div data-testid="wissen-view-dokumente" data-context={context}>
              Dokumente
            </div>
          )}
          {viewMode === 'canvas' && (
            <div data-testid="wissen-view-canvas" data-context={context}>
              Canvas
            </div>
          )}
          {viewMode === 'medien' && (
            <div data-testid="wissen-view-medien" data-context={context}>
              Medien
            </div>
          )}
          {viewMode === 'verbindungen' && (
            <div data-testid="wissen-view-verbindungen" data-context={context}>
              Verbindungen
            </div>
          )}
          {viewMode === 'lernen' && (
            <div data-testid="wissen-view-lernen" data-context={context}>
              Lernen
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
