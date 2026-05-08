/**
 * DemoWelcome
 *
 * Self-contained onboarding card for ZenAI demo users. Can be mounted
 * anywhere inside an authenticated demo session (e.g. Dashboard header).
 *
 * Behavior:
 *   - Checks /api/demo/status on mount to decide the initial message.
 *   - Offers a "Load Alex Chen data" button that POSTs /api/demo/seed.
 *   - Offers "Reset demo" once seeded, which DELETEs /api/demo/reset.
 *   - Remembers dismissal in localStorage (`zenai_demo_welcome_dismissed`).
 *
 * Only renders when localStorage.zenai_demo === 'true' — otherwise it returns
 * null so it's safe to mount unconditionally.
 */

import { useEffect, useState } from 'react';
import axios from 'axios';

interface DemoStatusResponse {
  success: boolean;
  persona: string;
  userId: string;
  seeded: boolean;
  counts: {
    coreBlocks: number;
    topics: number;
    ideas: number;
    facts: number;
    episodes: number;
  };
  expected: {
    coreBlocks: number;
    topics: number;
    ideas: number;
    facts: number;
    episodes: number;
  };
}

const STORAGE_KEY = 'zenai_demo_welcome_dismissed';

function isDemoSession(): boolean {
  try {
    return localStorage.getItem('zenai_demo') === 'true';
  } catch {
    return false;
  }
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function DemoWelcome() {
  const [visible, setVisible] = useState<boolean>(() => isDemoSession() && !isDismissed());
  const [status, setStatus] = useState<DemoStatusResponse | null>(null);
  const [busy, setBusy] = useState<'idle' | 'seeding' | 'resetting'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    axios
      .get<DemoStatusResponse>('/api/demo/status')
      .then((res) => {
        if (!cancelled) setStatus(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('Status konnte nicht geladen werden.');
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  const handleSeed = async () => {
    setBusy('seeding');
    setError(null);
    try {
      await axios.post('/api/demo/seed');
      const res = await axios.get<DemoStatusResponse>('/api/demo/status');
      setStatus(res.data);
    } catch {
      setError('Daten konnten nicht geladen werden.');
    } finally {
      setBusy('idle');
    }
  };

  const handleReset = async () => {
    setBusy('resetting');
    setError(null);
    try {
      await axios.delete('/api/demo/reset');
      const res = await axios.get<DemoStatusResponse>('/api/demo/status');
      setStatus(res.data);
    } catch {
      setError('Reset konnte nicht ausgeführt werden.');
    } finally {
      setBusy('idle');
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  };

  const seeded = status?.seeded ?? false;

  return (
    <aside
      className="demo-welcome"
      role="region"
      aria-label="ZenAI Demo-Begrüßung"
      data-testid="demo-welcome"
    >
      <div className="demo-welcome-header">
        <h2 className="demo-welcome-title">Willkommen im ZenAI-Demo</h2>
        <button
          type="button"
          className="demo-welcome-close"
          aria-label="Demo-Begrüßung schließen"
          onClick={handleDismiss}
        >
          ×
        </button>
      </div>

      <p className="demo-welcome-body">
        {seeded ? (
          <>
            Dein Demo-Workspace enthält die Daten von <strong>Alex Chen</strong> —
            {status
              ? ` ${status.counts.ideas} Ideen, ${status.counts.facts} gelernte Fakten und ${status.counts.episodes} Erinnerungen.`
              : ''}
            {' '}Frag ZenAI z. B. nach <em>„Was steht heute auf meiner Liste?“</em>
          </>
        ) : (
          <>
            Lade die <strong>Alex Chen</strong>-Persona, um ZenAI mit einem
            realistischen Knowledge-Graph, 30 Ideen und 200 Erinnerungen zu erleben.
          </>
        )}
      </p>

      {error && (
        <p className="demo-welcome-error" role="alert">
          {error}
        </p>
      )}

      <div className="demo-welcome-actions">
        {!seeded && (
          <button
            type="button"
            className="demo-welcome-btn demo-welcome-btn-primary"
            onClick={handleSeed}
            disabled={busy !== 'idle'}
            aria-busy={busy === 'seeding'}
          >
            {busy === 'seeding' ? 'Wird geladen…' : 'Alex Chen-Daten laden'}
          </button>
        )}
        {seeded && (
          <button
            type="button"
            className="demo-welcome-btn demo-welcome-btn-secondary"
            onClick={handleReset}
            disabled={busy !== 'idle'}
            aria-busy={busy === 'resetting'}
          >
            {busy === 'resetting' ? 'Setze zurück…' : 'Demo zurücksetzen'}
          </button>
        )}
      </div>
    </aside>
  );
}

export default DemoWelcome;
