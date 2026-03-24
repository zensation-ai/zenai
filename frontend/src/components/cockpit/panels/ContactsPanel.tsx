import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const ContactsPage = lazy(() =>
  import('../../ContactsPage/ContactsPage').then(m => ({ default: m.ContactsPage }))
);

export default function ContactsPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div className="panel-loading">Laden...</div>}>
      <ContactsPage context={context} onBack={onClose} />
    </Suspense>
  );
}
