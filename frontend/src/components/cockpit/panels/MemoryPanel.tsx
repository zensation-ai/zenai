import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const MyAIPage = lazy(() =>
  import('../../MyAIPage').then(m => ({ default: m.MyAIPage }))
);

export default function MemoryPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <MyAIPage context={context} onBack={onClose} initialTab="memory" />
    </Suspense>
  );
}
