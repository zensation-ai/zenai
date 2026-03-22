import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const DocumentVaultPage = lazy(() =>
  import('../../DocumentVaultPage/DocumentVaultPage').then(m => ({ default: m.DocumentVaultPage }))
);

export default function DocumentsPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
      <DocumentVaultPage context={context} onBack={onClose} />
    </Suspense>
  );
}
