import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const InboxSmartPage = lazy(() =>
  import('../../EmailPage').then(m => ({ default: m.InboxSmartPage }))
);

export default function EmailPanel({ context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <InboxSmartPage context={context} />
    </Suspense>
  );
}
