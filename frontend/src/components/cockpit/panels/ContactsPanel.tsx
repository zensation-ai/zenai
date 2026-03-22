import { Suspense, lazy } from 'react';
import type { PanelProps } from '../panelRegistry';

const ContactsPage = lazy(() =>
  import('../../ContactsPage/ContactsPage').then(m => ({ default: m.ContactsPage }))
);

export default function ContactsPanel({ onClose, context }: PanelProps) {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Laden...</div>}>
      <ContactsPage context={context} onBack={onClose} />
    </Suspense>
  );
}
