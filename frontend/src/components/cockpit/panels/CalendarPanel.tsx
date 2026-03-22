import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const PlannerPage = lazy(() =>
  import('../../PlannerPage/PlannerPage').then(m => ({ default: m.PlannerPage }))
);

export default function CalendarPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
      <PlannerPage context={context} initialTab="calendar" onBack={onClose} />
    </Suspense>
  );
}
