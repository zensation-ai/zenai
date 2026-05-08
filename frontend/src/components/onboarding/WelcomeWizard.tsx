/**
 * WelcomeWizard — Sprint 1.6 (SaaS-Launch-Readiness, Item 2)
 *
 * Shown once per user, right after registration. Goal: get a brand-new user
 * into a functional state (context picked, demo data optional, first CTA
 * clicked) in under 3 minutes. Linear 4-step flow, skip-able, idempotent.
 *
 * Mount-condition in App.tsx:
 *   {user && user.onboarding_completed_at == null && <WelcomeWizard ... />}
 *
 * On finish (or Skip), POST /api/auth/onboarding/complete writes NOW() to
 * public.users.onboarding_completed_at; the parent refetches the user so the
 * wizard unmounts.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type OnboardingContext = 'operations' | 'finance' | 'people' | 'strategy';

interface Props {
  /** Called after step 4 (or Skip) has been persisted. */
  onComplete?: (completedAt: string) => void;
  /**
   * Optional navigation hook; step 3's CTA tiles call this with the target
   * page so the wizard can close & route in one click.
   */
  onNavigateCta?: (target: 'chat' | 'ideas' | 'memory') => void;
}

const CONTEXT_LABELS: Record<OnboardingContext, { title: string; description: string; emoji: string }> = {
  operations: {
    title: 'Operations',
    description: 'Tagesgeschäft, Projekte, Aufgaben — für Teams, die liefern.',
    emoji: '⚙️',
  },
  finance: {
    title: 'Finance',
    description: 'Budget, Cashflow, KPIs — für CFOs und Finance-Teams.',
    emoji: '💰',
  },
  people: {
    title: 'People',
    description: 'HR, Kultur, Leadership — für Teams rund um Menschen.',
    emoji: '👥',
  },
  strategy: {
    title: 'Strategy',
    description: 'Vision, OKRs, Business-Entwicklung — für strategische Arbeit.',
    emoji: '🎯',
  },
};

const TOUR_STEPS: Array<{ title: string; description: string }> = [
  {
    title: 'Sidebar-Navigation',
    description: 'Alle Tools sind links in der Sidebar. Du kannst sie jederzeit mit ⌘B ein- oder ausklappen.',
  },
  {
    title: 'Chat-Eingabe',
    description: 'Stelle hier Fragen in natürlicher Sprache. ZenAI wählt das richtige Tool automatisch.',
  },
  {
    title: 'Kontext-Switcher',
    description: 'Oben rechts wechselst du zwischen Operations, Finance, People und Strategy.',
  },
  {
    title: 'Command Palette',
    description: 'Drücke ⌘K für die schnelle Suche über Ideen, Dokumente und Navigation.',
  },
  {
    title: 'Profil-Menü',
    description: 'Unten links findest du Einstellungen, Abonnement und Abmelden.',
  },
];

async function postOnboardingComplete(token: string | null): Promise<string | null> {
  if (!token) return null;
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  try {
    const response = await fetch(`${apiUrl}/api/auth/onboarding/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.data?.onboarding_completed_at ?? null) as string | null;
  } catch {
    return null;
  }
}

async function postDemoSeed(apiKey: string | null): Promise<boolean> {
  if (!apiKey) return false;
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
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

async function patchDefaultContext(token: string | null, context: OnboardingContext): Promise<void> {
  if (!token) return;
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  try {
    await fetch(`${apiUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ preferences: { default_context: context } }),
    });
  } catch {
    /* best-effort */
  }
}

export function WelcomeWizard({ onComplete, onNavigateCta }: Props) {
  const { getAccessToken, refreshUser } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [context, setContext] = useState<OnboardingContext>('operations');
  const [seedRequested, setSeedRequested] = useState<boolean | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [tourIndex, setTourIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const finish = useCallback(
    async (reason: 'completed' | 'skipped') => {
      setSubmitting(true);
      const token = getAccessToken();
      const completedAt = await postOnboardingComplete(token);
      await refreshUser();
      setSubmitting(false);
      if (completedAt) {
        onComplete?.(completedAt);
      } else {
        // Fallback — even if the API call failed, use client time so we don't loop.
        onComplete?.(new Date().toISOString());
      }
      // reason is informational; kept for future analytics.
      void reason;
    },
    [getAccessToken, refreshUser, onComplete],
  );

  const handleContinueFromStep1 = useCallback(async () => {
    const token = getAccessToken();
    await patchDefaultContext(token, context);
    setStep(2);
  }, [getAccessToken, context]);

  const handleStep2Decision = useCallback(
    async (wantsDemo: boolean) => {
      setSeedRequested(wantsDemo);
      if (!wantsDemo) {
        setStep(3);
        return;
      }
      setSeeding(true);
      const apiKey = import.meta.env.VITE_API_KEY as string | undefined;
      const ok = await postDemoSeed(apiKey ?? null);
      setSeedResult(ok ? 'ok' : 'error');
      setSeeding(false);
      setStep(3);
    },
    [],
  );

  const handleCta = useCallback(
    (target: 'chat' | 'ideas' | 'memory') => {
      onNavigateCta?.(target);
      setStep(4);
    },
    [onNavigateCta],
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-wizard-title"
    >
      <div className="w-full max-w-xl mx-4 rounded-2xl border border-white/10 bg-[#0d1117]/95 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <p id="welcome-wizard-title" className="text-lg font-semibold text-white">
              Willkommen bei ZenAI
            </p>
            <p className="text-xs text-white/50">Schritt {step} von 4</p>
          </div>
          <button
            type="button"
            onClick={() => finish('skipped')}
            disabled={submitting}
            className="text-sm text-white/50 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Onboarding überspringen"
          >
            Überspringen
          </button>
        </div>

        <div className="px-6 py-6">
          {step === 1 && (
            <Step1ContextPicker
              context={context}
              onChange={setContext}
              onContinue={handleContinueFromStep1}
            />
          )}
          {step === 2 && (
            <Step2DemoSeed
              seeding={seeding}
              seedResult={seedResult}
              seedRequested={seedRequested}
              onChoose={handleStep2Decision}
            />
          )}
          {step === 3 && <Step3Cta onChoose={handleCta} />}
          {step === 4 && (
            <Step4Tour
              index={tourIndex}
              onPrev={() => setTourIndex(i => Math.max(0, i - 1))}
              onNext={() => setTourIndex(i => Math.min(TOUR_STEPS.length - 1, i + 1))}
              onDone={() => finish('completed')}
              submitting={submitting}
            />
          )}
        </div>

        <div className="flex items-center gap-1 px-6 py-3 border-t border-white/10">
          {[1, 2, 3, 4].map(n => (
            <span
              key={n}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                step >= n ? 'bg-[#00B4D8]' : 'bg-white/10',
              )}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step components
// ─────────────────────────────────────────────────────────────────────────────

function Step1ContextPicker({
  context,
  onChange,
  onContinue,
}: {
  context: OnboardingContext;
  onChange: (c: OnboardingContext) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <h2 className="text-base font-semibold text-white mb-1">Wofür willst du ZenAI hauptsächlich nutzen?</h2>
      <p className="text-sm text-white/60 mb-5">Du kannst später jederzeit zwischen allen Kontexten wechseln.</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Hauptkontext wählen">
        {(Object.keys(CONTEXT_LABELS) as OnboardingContext[]).map(key => {
          const meta = CONTEXT_LABELS[key];
          const active = context === key;
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                'rounded-xl border px-3 py-3 text-left transition-all',
                active
                  ? 'border-[#00B4D8] bg-[#00B4D8]/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/10',
              )}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg" aria-hidden="true">{meta.emoji}</span>
                <div>
                  <p className="text-sm font-medium text-white">{meta.title}</p>
                  <p className="text-xs text-white/50 mt-0.5">{meta.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={onContinue}>Weiter</Button>
      </div>
    </>
  );
}

function Step2DemoSeed({
  seeding,
  seedResult,
  seedRequested,
  onChoose,
}: {
  seeding: boolean;
  seedResult: 'idle' | 'ok' | 'error';
  seedRequested: boolean | null;
  onChoose: (wantsDemo: boolean) => void;
}) {
  return (
    <>
      <h2 className="text-base font-semibold text-white mb-1">Soll ich Demo-Daten laden?</h2>
      <p className="text-sm text-white/60 mb-5">
        Wir befüllen dein Workspace mit einer realistischen Persona (Alex Chen — Product Manager),
        damit du Memory, Suche und Chat direkt ausprobieren kannst. Du kannst später alles löschen.
      </p>
      {seeding ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          Demo-Daten werden geladen …
        </div>
      ) : seedResult === 'error' ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Laden hat nicht geklappt — kein Problem, du kannst später über <code>/einstellungen/demo</code> erneut seeden.
        </div>
      ) : seedResult === 'ok' ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Demo-Daten geladen — weiter geht's.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onChoose(false)}>Nein, danke</Button>
          <Button onClick={() => onChoose(true)}>Ja, laden</Button>
        </div>
      )}
      {!seeding && seedResult !== 'idle' && (
        <div className="mt-6 flex justify-end">
          <Button onClick={() => onChoose(seedRequested ?? false)}>Weiter</Button>
        </div>
      )}
    </>
  );
}

function Step3Cta({ onChoose }: { onChoose: (target: 'chat' | 'ideas' | 'memory') => void }) {
  const tiles: Array<{ id: 'chat' | 'ideas' | 'memory'; title: string; description: string; emoji: ReactNode }> = [
    { id: 'chat', title: 'Chat starten', description: 'Stelle eine Frage in natürlicher Sprache.', emoji: '💬' },
    { id: 'ideas', title: 'Idee erstellen', description: 'Starte dein erstes strukturiertes Denken.', emoji: '💡' },
    { id: 'memory', title: 'Memory abfragen', description: 'Was weiß ZenAI schon über dich?', emoji: '🧠' },
  ];
  return (
    <>
      <h2 className="text-base font-semibold text-white mb-1">Womit möchtest du starten?</h2>
      <p className="text-sm text-white/60 mb-5">Such dir einen Einstieg aus — du kannst alles später nachholen.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {tiles.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChoose(t.id)}
            className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2" aria-hidden="true">{t.emoji}</div>
            <p className="text-sm font-medium text-white">{t.title}</p>
            <p className="text-xs text-white/50 mt-1">{t.description}</p>
          </button>
        ))}
      </div>
    </>
  );
}

function Step4Tour({
  index,
  onPrev,
  onNext,
  onDone,
  submitting,
}: {
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onDone: () => void;
  submitting: boolean;
}) {
  const tour = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;
  return (
    <>
      <h2 className="text-base font-semibold text-white mb-1">Kurze Tour ({index + 1} / {TOUR_STEPS.length})</h2>
      <p className="text-sm text-white/60 mb-5">Die wichtigsten Elemente auf einen Blick.</p>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm font-medium text-white">{tour.title}</p>
        <p className="text-sm text-white/70 mt-1">{tour.description}</p>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onPrev} disabled={index === 0}>Zurück</Button>
        {isLast ? (
          <Button onClick={onDone} disabled={submitting}>
            {submitting ? 'Speichert …' : 'Los geht\'s'}
          </Button>
        ) : (
          <Button onClick={onNext}>Weiter</Button>
        )}
      </div>
    </>
  );
}
