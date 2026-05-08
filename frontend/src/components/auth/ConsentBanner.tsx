/**
 * Sprint 1.10 — DSGVO Consent Banner (Signup + First-Login)
 *
 * Pflicht-Modal direkt nach Registrierung (und einmalig für Bestandsuser beim
 * nächsten Login). Erfasst 4 togglebare Kategorien + 1 Session-essenzielle
 * Kategorie (cookies_functional, nicht abwählbar). Ruft POST
 * /api/auth/consent/banner-complete, dann refreshUser() damit
 * `consent_banner_shown_at` im AuthContext aktualisiert wird und das Modal
 * schließt.
 */

import { useCallback, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

type TogglableKind =
  | 'cookies_analytics'
  | 'ai_training_opt_out'
  | 'analytics_tracking'
  | 'functional_tracking';

interface ToggleMeta {
  kind: TogglableKind;
  title: string;
  description: string;
  defaultGranted: boolean;
}

const TOGGLES: ToggleMeta[] = [
  {
    kind: 'cookies_analytics',
    title: 'Analytics-Cookies',
    description:
      'Hilft uns zu verstehen, welche Features genutzt werden. Anonymisiert, keine Profilbildung durch Dritte.',
    defaultGranted: false,
  },
  {
    kind: 'ai_training_opt_out',
    title: 'AI-Training Opt-Out',
    description:
      'Standard ist Opt-Out aktiv: Deine Daten werden NICHT zum Training genutzt. Du kannst später in den Einstellungen zustimmen.',
    defaultGranted: true,
  },
  {
    kind: 'analytics_tracking',
    title: 'Analytics-Tracking',
    description:
      'Sammelt Nutzungs-Events für Produktverbesserung. Jederzeit in den Einstellungen widerrufbar.',
    defaultGranted: false,
  },
  {
    kind: 'functional_tracking',
    title: 'Smart-Suggestions-Telemetrie',
    description:
      'Trainiert personalisierte Empfehlungen nur für dich. Keine Aggregation, keine Weitergabe.',
    defaultGranted: false,
  },
];

export interface ConsentBannerProps {
  /** Called after successful submit — parent closes the banner. Optional. */
  onComplete?: () => void;
}

export function ConsentBanner({ onComplete }: ConsentBannerProps) {
  const { getAccessToken, refreshUser } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || '';

  const [choices, setChoices] = useState<Record<TogglableKind, boolean>>(() =>
    TOGGLES.reduce(
      (acc, t) => ({ ...acc, [t.kind]: t.defaultGranted }),
      {} as Record<TogglableKind, boolean>,
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (kind: TogglableKind) => {
    setChoices((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${apiUrl}/api/auth/consent/banner-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(choices),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      await refreshUser();
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  }, [apiUrl, choices, getAccessToken, onComplete, refreshUser]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-banner-title"
    >
      <div className="w-full max-w-2xl mx-4 rounded-2xl border border-white/10 bg-[#0d1117]/95 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <p id="consent-banner-title" className="text-lg font-semibold text-white">
            Datenschutz & Einwilligungen
          </p>
          <p className="text-xs text-white/60 mt-1">
            Du kannst jede Wahl jederzeit in den Einstellungen unter{' '}
            <span className="text-white/80">Datenschutz</span> ändern.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Funktionale Cookies</p>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                Immer aktiv
              </span>
            </div>
            <p className="text-xs text-white/60 mt-1">
              Notwendig für Login-Sessions und grundlegende App-Funktionen. Nicht abwählbar.
            </p>
          </div>

          {TOGGLES.map((t) => (
            <label
              key={t.kind}
              className="flex items-start gap-3 rounded-lg bg-white/5 border border-white/10 p-3 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <input
                type="checkbox"
                checked={choices[t.kind]}
                onChange={() => toggle(t.kind)}
                disabled={submitting}
                aria-label={t.title}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-500 focus:ring-emerald-500/50"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{t.title}</p>
                <p className="text-xs text-white/60 mt-1">{t.description}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-white/10 space-y-3">
          <p className="text-xs text-white/60">
            Mit Klick auf &bdquo;Auswahl speichern&ldquo; akzeptierst du unsere{' '}
            <a
              href="/datenschutz"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-300 hover:underline"
            >
              Datenschutzerklärung
            </a>{' '}
            und{' '}
            <a
              href="/agb"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-300 hover:underline"
            >
              AGB
            </a>
            .
          </p>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#0d1117] font-semibold py-2.5 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Speichere…' : 'Auswahl speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
