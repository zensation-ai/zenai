import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const FinancePage = lazy(() =>
  import('../../FinancePage/FinancePage').then(m => ({ default: m.FinancePage }))
);

export default function FinancePanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <FinancePage context={context} onBack={onClose} />
    </Suspense>
  );
}
