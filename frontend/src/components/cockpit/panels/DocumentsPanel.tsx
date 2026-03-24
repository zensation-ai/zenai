import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const DocumentVaultPage = lazy(() =>
  import('../../DocumentVaultPage/DocumentVaultPage').then(m => ({ default: m.DocumentVaultPage }))
);

export default function DocumentsPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <DocumentVaultPage context={context} onBack={onClose} />
    </Suspense>
  );
}
