import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const AgentTeamsPage = lazy(() =>
  import('../../AgentTeamsPage').then(m => ({ default: m.AgentTeamsPage }))
);

export default function AgentsPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <AgentTeamsPage context={context} onBack={onClose} embedded />
    </Suspense>
  );
}
