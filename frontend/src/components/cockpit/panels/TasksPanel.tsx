import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const PlannerPage = lazy(() =>
  import('../../PlannerPage/PlannerPage').then(m => ({ default: m.PlannerPage }))
);

export default function TasksPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <PlannerPage context={context} initialTab="tasks" onBack={onClose} />
    </Suspense>
  );
}
