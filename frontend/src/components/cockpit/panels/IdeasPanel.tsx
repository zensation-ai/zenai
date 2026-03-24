import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const IdeasSmartPage = lazy(() =>
  import('../../IdeasPage').then(m => ({ default: m.IdeasSmartPage }))
);

export default function IdeasPanel({ context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <IdeasSmartPage context={context} />
    </Suspense>
  );
}
