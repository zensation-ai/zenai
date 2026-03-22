import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const FinancePage = lazy(() =>
  import('../../FinancePage/FinancePage').then(m => ({ default: m.FinancePage }))
);

export default function FinancePanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
      <FinancePage context={context} onBack={onClose} />
    </Suspense>
  );
}
