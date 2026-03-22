import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const IdeasSmartPage = lazy(() =>
  import('../../IdeasPage').then(m => ({ default: m.IdeasSmartPage }))
);

export default function IdeasPanel({ context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
      <IdeasSmartPage context={context} />
    </Suspense>
  );
}
