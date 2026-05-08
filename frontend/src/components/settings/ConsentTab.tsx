/**
 * ConsentTab — DSGVO Art. 6/7 Granulare Einwilligungen
 *
 * Sprint 1.2 (2026-04-16). Lebt im Settings unter "Datenschutz".
 *
 * Zeigt alle Consent-Arten als Toggle + Historie-Link. Widerruf
 * (Art. 7 Abs. 3) ist genauso einfach wie Erteilung — ein Klick.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { SkeletonLoader } from '../SkeletonLoader';

// Mirror der Backend-Typen — bewusst lokal dupliziert, um harte
// Frontend/Backend-Kopplung zu vermeiden (siehe CLAUDE.md: Plan-Typ-Divergenz
// war in Sprint 1.1 genau so ein Bug).
type ConsentKind =
  | 'cookies_functional'
  | 'cookies_analytics'
  | 'ai_training_opt_out'
  | 'analytics_tracking'
  | 'functional_tracking';

interface ConsentEntry {
  granted: boolean;
  granted_at: string | null;
  is_default: boolean;
}

type ConsentState = Record<ConsentKind, ConsentEntry>;

interface ConsentApiResponse {
  success: boolean;
  data: {
    state: ConsentState;
    supported_kinds: ConsentKind[];
  };
}

interface ConsentMeta {
  kind: ConsentKind;
  title: string;
  description: string;
  // "Negative Logik": bei ai_training_opt_out bedeutet granted=true = "ja, opt-out aktiv" (User-Vorteil).
  // Das Label spiegelt das wider.
  toggleLabel: string;
  category: 'essential' | 'functional' | 'analytics' | 'privacy';
}

const CONSENT_META: ConsentMeta[] = [
  {
    kind: 'cookies_functional',
    title: 'Funktionale Cookies',
    description:
      'Notwendig für Login-Sessions, Spracheinstellungen und grundlegende App-Funktionen. Ohne diese funktioniert die App nicht.',
    toggleLabel: 'Erlaubt',
    category: 'essential',
  },
  {
    kind: 'cookies_analytics',
    title: 'Analytics-Cookies',
    description:
      'Hilft uns zu verstehen, welche Features genutzt werden (PostHog/GA4). Anonymisiert. Keine Profilbildung durch Dritte.',
    toggleLabel: 'Erlaubt',
    category: 'analytics',
  },
  {
    kind: 'ai_training_opt_out',
    title: 'AI-Training Opt-Out',
    description:
      'Standard ist Opt-Out: Deine Daten werden NICHT zum Training unserer Modelle genutzt. Du kannst jederzeit zustimmen (=Opt-In) und später wieder widerrufen.',
    toggleLabel: 'Opt-Out aktiv (empfohlen)',
    category: 'privacy',
  },
  {
    kind: 'analytics_tracking',
    title: 'Analytics-Tracking',
    description:
      'Sammelt Nutzungs-Events für Produktverbesserung. Wird bei Widerruf sofort gestoppt.',
    toggleLabel: 'Erlaubt',
    category: 'analytics',
  },
  {
    kind: 'functional_tracking',
    title: 'Smart-Suggestions-Telemetrie',
    description:
      'Trainiert personalisierte Empfehlungen nur für dich. Keine Aggregation. Widerruf setzt Empfehlungen zurück.',
    toggleLabel: 'Erlaubt',
    category: 'functional',
  },
];

export function ConsentTab() {
  const { getAccessToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || '';

  const [state, setState] = useState<ConsentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ConsentKind | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAccessToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getAccessToken]);

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/consent`, { headers: authHeaders() });
      if (res.ok) {
        const data: ConsentApiResponse = await res.json();
        setState(data.data.state);
      }
    } catch {
      setMsg({ type: 'error', text: 'Consent-Zustand konnte nicht geladen werden.' });
    } finally {
      setLoading(false);
    }
  }, [apiUrl, authHeaders]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleToggle = async (kind: ConsentKind, newGranted: boolean) => {
    setSaving(kind);
    setMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/auth/consent`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ kind, granted: newGranted }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Fehler beim Speichern');
      }
      setState(prev =>
        prev
          ? {
              ...prev,
              [kind]: { granted: newGranted, granted_at: new Date().toISOString(), is_default: false },
            }
          : prev
      );
      setMsg({ type: 'success', text: 'Einstellung gespeichert.' });
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Fehler beim Speichern',
      });
    } finally {
      setSaving(null);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleResetAll = async () => {
    // "Zurücksetzen"-Funktion: widerruft alle nicht-essentiellen Consents.
    // Art. 7 Abs. 3 DSGVO — so einfach wie Erteilung.
    if (!state) return;
    const toRevoke = CONSENT_META.filter(
      m => m.category !== 'essential' && state[m.kind]?.granted && m.kind !== 'ai_training_opt_out'
    );
    if (toRevoke.length === 0) return;

    if (
      !confirm(
        `${toRevoke.length} Einwilligung(en) werden zurückgesetzt. AI-Training-Opt-Out bleibt unverändert. Fortfahren?`
      )
    ) {
      return;
    }

    for (const m of toRevoke) {
      await handleToggle(m.kind, false);
    }
  };

  if (loading) {
    return <SkeletonLoader type="card" count={3} />;
  }

  if (!state) {
    return (
      <div className="glass rounded-lg border border-glass-border p-6">
        <p className="text-sm text-text-secondary">Einwilligungen konnten nicht geladen werden.</p>
        <Button onClick={() => void loadState()} variant="outline" size="sm" className="mt-3">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="consent-tab">
      {/* Kopf + globale Reset-Option */}
      <div className="glass rounded-lg border border-glass-border p-5">
        <h2 className="text-sm font-semibold text-text m-0">Deine Einwilligungen (DSGVO Art. 6/7)</h2>
        <p className="text-xs text-text-secondary mt-2">
          Du kannst jede Einwilligung jederzeit widerrufen — das ist genauso einfach wie die
          Erteilung (Art. 7 Abs. 3 DSGVO). Essentielle Cookies sind für den App-Betrieb notwendig
          und lassen sich nicht deaktivieren; eine Nicht-Nutzung der App ist in diesem Fall die
          Alternative.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResetAll}>
            Alle nicht-essentiellen zurücksetzen
          </Button>
          {msg && (
            <span
              className={`text-xs ${
                msg.type === 'success' ? 'text-green-600' : 'text-red-600'
              }`}
              role="status"
            >
              {msg.text}
            </span>
          )}
        </div>
      </div>

      {/* Toggles pro kind */}
      <div className="glass rounded-lg border border-glass-border overflow-hidden">
        {CONSENT_META.map((meta, idx) => {
          const entry = state[meta.kind];
          const granted = entry?.granted ?? false;
          const isEssential = meta.category === 'essential';
          const isBusy = saving === meta.kind;

          return (
            <div
              key={meta.kind}
              className={`flex items-start justify-between gap-4 px-5 py-4 ${
                idx > 0 ? 'border-t border-border/10' : ''
              }`}
            >
              <div className="flex flex-col gap-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{meta.title}</span>
                  {isEssential && (
                    <span className="text-[10px] uppercase tracking-wide text-text-muted bg-surface-hover px-2 py-0.5 rounded">
                      Essentiell
                    </span>
                  )}
                  {entry?.is_default && (
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
                      (Standard)
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-secondary">{meta.description}</span>
                {entry?.granted_at && !entry.is_default && (
                  <span className="text-[10px] text-text-muted">
                    Zuletzt geändert: {new Date(entry.granted_at).toLocaleString('de-DE')}
                  </span>
                )}
              </div>

              <label
                className={`inline-flex items-center gap-2 cursor-pointer select-none ${
                  isEssential ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`${meta.title}: ${meta.toggleLabel}`}
                  checked={granted}
                  disabled={isEssential || isBusy}
                  onChange={e => void handleToggle(meta.kind, e.target.checked)}
                  className="sr-only peer"
                />
                <span
                  className={`relative inline-block w-10 h-6 rounded-full transition-colors ${
                    granted ? 'bg-primary' : 'bg-surface-hover'
                  } ${isEssential ? 'cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      granted ? 'translate-x-4' : ''
                    }`}
                  />
                </span>
                <span className="text-xs text-text-secondary min-w-[80px]">
                  {granted ? meta.toggleLabel : 'Nicht erlaubt'}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
