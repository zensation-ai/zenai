import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const InboxSmartPage = lazy(() =>
  import('../../EmailPage').then(m => ({ default: m.InboxSmartPage }))
);

export default function EmailPanel({ context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
      <InboxSmartPage context={context} />
    </Suspense>
  );
}
