/**
 * EmptyStateWithDemoSeed — Sprint 1.6 (SaaS-Launch-Readiness, Item 2)
 *
 * Thin wrapper around the design-system EmptyState that adds a
 * "Demo-Daten laden" + "Neu erstellen" CTA pair. Meant for the big
 * landing empty states on IdeasPage / EmailPage / ContactsPage where
 * the user has literally nothing yet — so offering a demo-seed is
 * the most helpful next step.
 *
 * The component is intentionally presentational: the parent decides
 * what "create" means (it's different per page). Demo-seed is routed
 * to POST /api/demo/seed, using the same env API key the WelcomeWizard
 * uses.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Label for the primary "create new" action. Null to hide. */
  createLabel?: string | null;
  /** Callback for the primary "create new" action. */
  onCreate?: () => void;
  /** Hide the demo-seed button entirely (e.g. for production-only UIs). */
  hideDemoSeed?: boolean;
}

async function triggerDemoSeed(): Promise<boolean> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiKey = import.meta.env.VITE_API_KEY as string | undefined;
  if (!apiKey) return false;
  try {
    const response = await fetch(`${apiUrl}/api/demo/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function EmptyStateWithDemoSeed({
  icon,
  title,
  description,
  createLabel = 'Neu erstellen',
  onCreate,
  hideDemoSeed = false,
}: Props) {
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState<'idle' | 'ok' | 'error'>('idle');

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    const ok = await triggerDemoSeed();
    setResult(ok ? 'ok' : 'error');
    setSeeding(false);
    if (ok) {
      // Reload the page's queries; the simplest and most reliable path is
      // a soft reload (react-query refetch would require threading a prop
      // through every caller, which is noisy for a rarely-used CTA).
      setTimeout(() => window.location.reload(), 600);
    }
  }, []);

  const action = (
    <div className="flex flex-col sm:flex-row items-stretch gap-2">
      {createLabel !== null && onCreate && (
        <Button onClick={onCreate}>{createLabel}</Button>
      )}
      {!hideDemoSeed && (
        <Button
          variant="outline"
          onClick={handleSeed}
          disabled={seeding || result === 'ok'}
        >
          {seeding ? 'Lädt …' : result === 'ok' ? 'Geladen — Seite lädt neu' : 'Demo-Daten laden'}
        </Button>
      )}
      {result === 'error' && (
        <span className="text-xs text-red-400 self-center">
          Nicht geladen — VITE_API_KEY prüfen.
        </span>
      )}
    </div>
  );

  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={action}
    />
  );
}
