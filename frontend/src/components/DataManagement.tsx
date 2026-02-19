/**
 * DataManagement - Export + Sync kombiniert
 *
 * Wird als Tab in SettingsDashboard eingebettet.
 * Stacked ExportDashboard (oben) und SyncDashboard (unten).
 */

import { Suspense, lazy } from 'react';
import { SkeletonLoader } from './SkeletonLoader';

import type { AIContext } from './ContextSwitcher';

const ExportDashboard = lazy(() => import('./ExportDashboard').then(m => ({ default: m.ExportDashboard })));
const SyncDashboard = lazy(() => import('./SyncDashboard').then(m => ({ default: m.SyncDashboard })));

interface DataManagementProps {
  context: AIContext;
}

export function DataManagement({ context }: DataManagementProps) {
  const noop = () => {};

  return (
    <div className="data-management">
      <section className="data-management-section">
        <h3 className="data-management-section-title">
          <span>📤</span> Daten exportieren
        </h3>
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <ExportDashboard onBack={noop} context={context} embedded />
        </Suspense>
      </section>

      <hr className="data-management-divider" />

      <section className="data-management-section">
        <h3 className="data-management-section-title">
          <span>🔄</span> Synchronisation
        </h3>
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <SyncDashboard onBack={noop} context={context} embedded />
        </Suspense>
      </section>
    </div>
  );
}

export default DataManagement;
