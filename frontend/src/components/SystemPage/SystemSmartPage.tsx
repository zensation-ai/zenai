/**
 * SystemSmartPage - Main System/Settings container (Phase 110b)
 *
 * Uses grouped sidebar navigation (SystemNav) instead of ViewToggle
 * because there are too many sub-pages for a segmented control.
 */
import { useState, useEffect, Suspense } from 'react';
import { SystemNav } from './SystemNav';
import { SmartPageSkeleton } from '../skeletons/PageSkeletons';
import type { SystemTab, SystemSmartPageProps } from './types';
import { ALL_SYSTEM_TABS } from './types';
import './SystemSmartPage.css';

/** Map initialTab string values → SystemTab */
function resolveInitialTab(tab: string | undefined): SystemTab {
  if (!tab) return 'profil';
  // Check direct match
  if (ALL_SYSTEM_TABS.includes(tab as SystemTab)) return tab as SystemTab;
  // English aliases
  switch (tab) {
    case 'profile': return 'profil';
    case 'account': return 'konto';
    case 'general': return 'allgemein';
    case 'ai': return 'ki';
    case 'security': return 'sicherheit';
    case 'privacy': return 'datenschutz';
    case 'integrations': return 'integrationen';
    case 'extensions': return 'erweiterungen';
    case 'data': return 'daten';
    default: return 'profil';
  }
}

export function SystemSmartPage({ context, initialTab }: SystemSmartPageProps) {
  const [activeTab, setActiveTab] = useState<SystemTab>(() => resolveInitialTab(initialTab));

  useEffect(() => {
    if (initialTab) {
      setActiveTab(resolveInitialTab(initialTab));
    }
  }, [initialTab]);

  return (
    <div className="system-smart-page" role="main" aria-label="System">
      <div className="system-smart-page__nav">
        <SystemNav value={activeTab} onChange={setActiveTab} />
      </div>

      <div className="system-smart-page__content">
        <Suspense fallback={<SmartPageSkeleton />}>
          <div data-testid={`system-view-${activeTab}`} data-context={context}>
            {activeTab}
          </div>
        </Suspense>
      </div>
    </div>
  );
}
