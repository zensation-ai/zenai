/**
 * MeineKISmartPage - Main AI personalization container (Phase 110a)
 *
 * Thin wrapper that delegates to existing child components.
 * Assembles ViewToggle + Suspense-wrapped view content.
 */
import { useState, useEffect, Suspense } from 'react';
import { ViewToggle } from './ViewToggle';
import { SmartPageSkeleton } from '../skeletons/PageSkeletons';
import type { MeineKIViewMode, MeineKISmartPageProps } from './types';
import './MeineKISmartPage.css';

/** Map initialTab string values → MeineKIViewMode */
function resolveInitialView(tab: string | undefined): MeineKIViewMode {
  if (!tab) return 'persona';
  switch (tab) {
    case 'persona':
    case 'personalize':
      return 'persona';
    case 'wissen':
    case 'knowledge':
    case 'memory':
      return 'wissen';
    case 'prozeduren':
    case 'procedures':
      return 'prozeduren';
    case 'stimme':
    case 'voice':
    case 'voice-chat':
      return 'stimme';
    default:
      return 'persona';
  }
}

export function MeineKISmartPage({ context, initialTab }: MeineKISmartPageProps) {
  const [viewMode, setViewMode] = useState<MeineKIViewMode>(() => resolveInitialView(initialTab));

  useEffect(() => {
    if (initialTab) {
      setViewMode(resolveInitialView(initialTab));
    }
  }, [initialTab]);

  return (
    <div className="meine-ki-smart-page" role="main" aria-label="Meine KI">
      <div className="meine-ki-smart-page__toolbar">
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="meine-ki-smart-page__content">
        <Suspense fallback={<SmartPageSkeleton />}>
          {viewMode === 'persona' && (
            <div data-testid="meine-ki-view-persona" data-context={context}>
              Persona
            </div>
          )}
          {viewMode === 'wissen' && (
            <div data-testid="meine-ki-view-wissen" data-context={context}>
              Wissen
            </div>
          )}
          {viewMode === 'prozeduren' && (
            <div data-testid="meine-ki-view-prozeduren" data-context={context}>
              Prozeduren
            </div>
          )}
          {viewMode === 'stimme' && (
            <div data-testid="meine-ki-view-stimme" data-context={context}>
              Stimme
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
