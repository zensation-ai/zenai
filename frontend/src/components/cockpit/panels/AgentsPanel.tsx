import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const AgentTeamsPage = lazy(() =>
  import('../../AgentTeamsPage').then(m => ({ default: m.AgentTeamsPage }))
);

export default function AgentsPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
      <AgentTeamsPage context={context} onBack={onClose} embedded />
    </Suspense>
  );
}
