/**
 * BillingTab — Abonnement & Zahlungsverwaltung
 *
 * Shows the current plan, upgrade options, and a link to the Stripe
 * Customer Portal for existing subscribers.
 *
 * Multi-tenancy mode: When an org is active, shows org-level billing
 * with workspace credit breakdown and seat management. Only the org
 * owner can manage billing.
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCredits, useOrgBillingStatus } from '../../hooks/queries/useBilling';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type PlanTier = 'free' | 'pro' | 'enterprise';

interface Subscription {
  plan: PlanTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  personal: 'Personal',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

const PLAN_BG_CLASS: Record<string, string> = {
  free: 'bg-gray-500',
  personal: 'bg-emerald-500',
  pro: 'bg-sky-500',
  business: 'bg-amber-500',
  enterprise: 'bg-violet-500',
};


const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  trialing: 'Testphase',
  past_due: 'Zahlung ausstehend',
  canceled: 'Gekündigt',
  incomplete: 'Unvollständig',
  unpaid: 'Unbezahlt',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) {return '—';}
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date(iso));
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function BillingTab() {
  const { getAccessToken, currentOrg, user } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || '';

  // Org-level billing when multi-tenancy is active
  const isOrgBilling = !!currentOrg;
  const isOrgOwner = currentOrg?.owner_id === user?.id;
  const { data: orgBilling, isLoading: orgBillingLoading } = useOrgBillingStatus(currentOrg?.id);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Read success/canceled from URL params (Stripe redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') {
      setSuccessMsg('Dein Abonnement wurde erfolgreich aktiviert!');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('canceled') === '1') {
      setError('Der Checkout wurde abgebrochen.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const fetchSubscription = useCallback(async () => {
    if (isOrgBilling) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${apiUrl}/api/billing/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { success: boolean; data: Subscription; error?: string };
      if (!data.success) {throw new Error(data.error || 'Unbekannter Fehler');}
      setSubscription(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abonnement konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, getAccessToken, isOrgBilling]);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  const handleUpgrade = async (priceId: string, planLabel: string) => {
    setActionLoading(planLabel);
    setError(null);
    try {
      const token = getAccessToken();
      const endpoint = isOrgBilling
        ? `${apiUrl}/api/billing/org/${currentOrg!.id}/checkout`
        : `${apiUrl}/api/billing/checkout`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });
      const data = (await res.json()) as { success: boolean; url?: string; error?: string };
      if (!data.success || !data.url) {throw new Error(data.error || 'Checkout fehlgeschlagen');}
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade fehlgeschlagen.');
    } finally {
      setActionLoading(null);
    }
  };

  // Sprint 1.6 — tier-based checkout for per-user billing.
  // Lets the UI send friendly tier names (personal/pro/business) instead of
  // needing to know VITE_STRIPE_*_PRICE_ID at build time.
  const handleUpgradeTier = async (
    tier: 'personal' | 'pro' | 'business',
    planLabel: string,
  ) => {
    setActionLoading(planLabel);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${apiUrl}/api/billing/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier }),
      });
      const data = (await res.json()) as { success: boolean; url?: string; error?: string };
      if (!data.success || !data.url) {throw new Error(data.error || 'Checkout fehlgeschlagen');}
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade fehlgeschlagen.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePortal = async () => {
    setActionLoading('portal');
    setError(null);
    try {
      const token = getAccessToken();
      const endpoint = isOrgBilling
        ? `${apiUrl}/api/billing/org/${currentOrg!.id}/portal`
        : `${apiUrl}/api/billing/portal`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { success: boolean; url?: string; error?: string };
      if (!data.success || !data.url) {throw new Error(data.error || 'Portal fehlgeschlagen');}
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kundencenter konnte nicht geöffnet werden.');
    } finally {
      setActionLoading(null);
    }
  };

  const { data: credits } = useCredits();

  const personalPriceId = import.meta.env.VITE_STRIPE_PERSONAL_PRICE_ID as string | undefined;
  const proPriceId = import.meta.env.VITE_STRIPE_PRO_PRICE_ID as string | undefined;
  // Sprint 1.1 (2026-04-16): VITE_STRIPE_TEAM_PRICE_ID → VITE_STRIPE_BUSINESS_PRICE_ID with legacy fallback.
  const businessPriceId = (import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID
    ?? import.meta.env.VITE_STRIPE_TEAM_PRICE_ID) as string | undefined;
  const enterprisePriceId = import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID as string | undefined;
  const stripeAvailable = !!(personalPriceId || proPriceId || businessPriceId || enterprisePriceId);

  // ─────────────────────────────────────────────
  // Org-Level Billing Render
  // ─────────────────────────────────────────────

  if (isOrgBilling) {
    if (orgBillingLoading) {
      return (
        <div className="flex flex-col gap-6 max-w-[640px] text-text-muted py-8" aria-busy="true" aria-live="polite">
          <p>Organisations-Billing wird geladen…</p>
        </div>
      );
    }

    const orgPlan = orgBilling?.subscription.plan ?? 'free';
    const orgStatus = orgBilling?.subscription.status ?? 'active';
    const totalCreditsUsed = orgBilling?.workspaceCredits.reduce((sum, wc) => sum + wc.creditsUsed, 0) ?? 0;
    const totalCreditsLimit = orgBilling?.workspaceCredits.reduce((sum, wc) => sum + wc.creditsLimit, 0) ?? 0;
    const totalCreditsRemaining = Math.max(0, totalCreditsLimit - totalCreditsUsed);

    return (
      <div className="flex flex-col gap-6 max-w-[640px]">
        {/* ── Success/Error banners ── */}
        {successMsg && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md text-sm font-medium bg-green-500/10 text-green-500 border border-green-500/30" role="status">
            {successMsg}
            <button className="bg-transparent border-none cursor-pointer text-lg leading-none text-inherit opacity-70 hover:opacity-100 px-1" onClick={() => setSuccessMsg(null)} aria-label="Schließen">×</button>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md text-sm font-medium bg-red-500/10 text-red-500 border border-red-500/30" role="alert">
            {error}
            <button className="bg-transparent border-none cursor-pointer text-lg leading-none text-inherit opacity-70 hover:opacity-100 px-1" onClick={() => setError(null)} aria-label="Schließen">×</button>
          </div>
        )}

        {/* ── Org Plan ── */}
        <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
          <h3 className="m-0 text-sm font-semibold text-text">Organisations-Plan</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase text-white', PLAN_BG_CLASS[orgPlan] ?? 'bg-gray-500')}
              aria-label={`Aktueller Plan: ${PLAN_LABELS[orgPlan]}`}
            >
              {PLAN_LABELS[orgPlan]}
            </span>
            <span className="text-[13px] text-text-secondary">
              {STATUS_LABELS[orgStatus] ?? orgStatus}
            </span>
            {orgBilling?.subscription.seatCount && (
              <span className="text-xs text-text-muted">
                {orgBilling.subscription.seatCount} {orgBilling.subscription.seatCount === 1 ? 'Platz' : 'Plätze'}
              </span>
            )}
            {orgBilling?.subscription.currentPeriodEnd && orgPlan !== 'free' && (
              <span className="text-xs text-text-muted ml-auto">
                {orgBilling.subscription.cancelAtPeriodEnd
                  ? `Läuft ab am ${formatDate(orgBilling.subscription.currentPeriodEnd)}`
                  : `Verlängert sich am ${formatDate(orgBilling.subscription.currentPeriodEnd)}`}
              </span>
            )}
          </div>
          <div className="text-xs text-text-muted">
            Organisation: <strong className="text-text">{currentOrg?.name}</strong>
          </div>
        </section>

        {/* ── Credit Overview ── */}
        <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
          <div className="flex items-baseline justify-between">
            <h3 className="m-0 text-sm font-semibold text-text">KI-Credits (Gesamt)</h3>
            <span className="text-xs text-text-muted">
              {totalCreditsUsed.toLocaleString('de-DE')} / {totalCreditsLimit.toLocaleString('de-DE')} verwendet
            </span>
          </div>
          <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full w-[var(--bar)] rounded-full transition-all duration-500',
                totalCreditsLimit > 0 && totalCreditsRemaining / totalCreditsLimit > 0.2
                  ? 'bg-primary'
                  : totalCreditsLimit > 0 && totalCreditsRemaining / totalCreditsLimit > 0.05
                    ? 'bg-amber-500'
                    : 'bg-red-500',
              )}
              style={{ '--bar': `${totalCreditsLimit > 0 ? Math.min(100, (totalCreditsUsed / totalCreditsLimit) * 100) : 0}%` } as CSSProperties}
              role="progressbar"
              aria-valuenow={totalCreditsUsed}
              aria-valuemin={0}
              aria-valuemax={totalCreditsLimit}
              aria-label={`${totalCreditsRemaining} von ${totalCreditsLimit} Credits verbleibend`}
            />
          </div>
        </section>

        {/* ── Workspace Credit Breakdown ── */}
        {orgBilling && orgBilling.workspaceCredits.length > 0 && (
          <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
            <h3 className="m-0 text-sm font-semibold text-text">Credits pro Workspace</h3>
            <div className="space-y-3">
              {orgBilling.workspaceCredits.map(wc => {
                const wsRemaining = Math.max(0, wc.creditsLimit - wc.creditsUsed);
                const wsPct = wc.creditsLimit > 0 ? (wc.creditsUsed / wc.creditsLimit) * 100 : 0;
                return (
                  <div key={wc.workspaceId} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-medium text-text">{wc.workspaceName}</span>
                      <span className="text-xs text-text-muted">
                        {wsRemaining.toLocaleString('de-DE')} / {wc.creditsLimit.toLocaleString('de-DE')}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full w-[var(--bar)] rounded-full transition-all duration-500',
                          wsPct < 75 ? 'bg-primary' : wsPct < 95 ? 'bg-amber-500' : 'bg-red-500',
                        )}
                        style={{ '--bar': `${Math.min(100, wsPct)}%` } as CSSProperties}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Manage subscription (portal) — owner only ── */}
        {isOrgOwner && orgBilling?.stripeCustomerId && (
          <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
            <h3 className="m-0 text-sm font-semibold text-text">Abonnement verwalten</h3>
            <p className="m-0 text-[13px] text-text-muted leading-relaxed">
              Ändere den Plan, verwalte Plätze oder kündige über das Stripe-Kundencenter.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handlePortal}
              disabled={actionLoading === 'portal'}
            >
              {actionLoading === 'portal' ? 'Weiterleitung…' : 'Kundencenter öffnen →'}
            </Button>
          </section>
        )}

        {/* ── Upgrade options — owner only ── */}
        {isOrgOwner && stripeAvailable && !['business', 'enterprise'].includes(orgPlan) && (
          <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
            <h3 className="m-0 text-sm font-semibold text-text">Plan upgraden</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">

              {/* Business */}
              {businessPriceId && ['free', 'personal', 'pro'].includes(orgPlan) && (
                <div className="flex flex-col gap-3 p-4 bg-bg border border-glass-border rounded-lg">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[15px] font-bold text-amber-500">Business</span>
                    <span className="text-xs text-text-muted">59 €/Platz/Monat</span>
                  </div>
                  <ul className="m-0 pl-4 text-[13px] text-text-secondary leading-[1.8]">
                    <li>Ab 3 Plätze</li>
                    <li>5.000 Credits/Platz/Monat</li>
                    <li>20 Workspaces</li>
                    <li>SSO, Audit-Log, Shared Memory</li>
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(businessPriceId, 'Business')}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'Business' ? 'Weiterleitung…' : 'Zu Business upgraden'}
                  </Button>
                </div>
              )}

              {/* Enterprise */}
              {enterprisePriceId && (
                <div className={cn(
                  'flex flex-col gap-3 p-4 bg-bg border rounded-lg',
                  'border-violet-500/40 bg-violet-500/5'
                )}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[15px] font-bold text-violet-500">Enterprise</span>
                    <span className="text-xs text-text-muted">ab 25.000 €/Jahr</span>
                  </div>
                  <ul className="m-0 pl-4 text-[13px] text-text-secondary leading-[1.8]">
                    <li>Alles aus Business</li>
                    <li>Dedicated EU-Instance, SAML SSO</li>
                    <li>SLA 99,9 % & DPA</li>
                    <li>Unbegrenzte Credits</li>
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(enterprisePriceId, 'Enterprise')}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'Enterprise' ? 'Weiterleitung…' : 'Zu Enterprise upgraden'}
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Non-owner info ── */}
        {!isOrgOwner && (
          <section className="flex flex-col gap-3 p-5 bg-transparent border border-dashed border-glass-border rounded-xl text-text-muted text-[13px]">
            <p className="m-0">
              Nur der Organisations-Eigentümer kann Abrechnungseinstellungen verwalten.
            </p>
          </section>
        )}

        {/* ── No Stripe configured ── */}
        {!stripeAvailable && isOrgOwner && (
          <section className="flex flex-col gap-3 p-5 bg-transparent border border-dashed border-glass-border rounded-xl text-text-muted text-[13px]">
            <p className="m-0">
              Zahlungen sind in dieser Installation nicht konfiguriert.
              Setze die Stripe-Umgebungsvariablen um Upgrade-Optionen anzuzeigen.
            </p>
          </section>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Per-User Billing (Legacy Mode)
  // ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6 max-w-[640px] text-text-muted py-8" aria-busy="true" aria-live="polite">
        <p>Abo-Daten werden geladen…</p>
      </div>
    );
  }

  const plan = subscription?.plan ?? 'free';
  const status = subscription?.status ?? 'active';

  return (
    <div className="flex flex-col gap-6 max-w-[640px]">
      {/* ── Success/Error banners ── */}
      {successMsg && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md text-sm font-medium bg-green-500/10 text-green-500 border border-green-500/30" role="status">
          {successMsg}
          <button className="bg-transparent border-none cursor-pointer text-lg leading-none text-inherit opacity-70 hover:opacity-100 px-1" onClick={() => setSuccessMsg(null)} aria-label="Schließen">×</button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md text-sm font-medium bg-red-500/10 text-red-500 border border-red-500/30" role="alert">
          {error}
          <button className="bg-transparent border-none cursor-pointer text-lg leading-none text-inherit opacity-70 hover:opacity-100 px-1" onClick={() => setError(null)} aria-label="Schließen">×</button>
        </div>
      )}

      {/* ── Current plan ── */}
      <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
        <h3 className="m-0 text-sm font-semibold text-text">Aktueller Plan</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase text-white', PLAN_BG_CLASS[plan] ?? 'bg-gray-500')}
            aria-label={`Aktueller Plan: ${PLAN_LABELS[plan]}`}
          >
            {PLAN_LABELS[plan]}
          </span>
          <span className="text-[13px] text-text-secondary">
            {STATUS_LABELS[status] ?? status}
          </span>
          {subscription?.currentPeriodEnd && plan !== 'free' && (
            <span className="text-xs text-text-muted ml-auto">
              {subscription.cancelAtPeriodEnd
                ? `Läuft ab am ${formatDate(subscription.currentPeriodEnd)}`
                : `Verlängert sich am ${formatDate(subscription.currentPeriodEnd)}`}
            </span>
          )}
        </div>
      </section>

      {/* ── Credits ── */}
      {credits && (
        <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
          <div className="flex items-baseline justify-between">
            <h3 className="m-0 text-sm font-semibold text-text">KI-Credits</h3>
            <span className="text-xs text-text-muted">
              {credits.used.toLocaleString('de-DE')} / {credits.limit.toLocaleString('de-DE')} verwendet
            </span>
          </div>
          <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full w-[var(--bar)] rounded-full transition-all duration-500',
                (credits.limit > 0 ? credits.remaining / credits.limit : 1) > 0.2
                  ? 'bg-primary'
                  : (credits.limit > 0 ? credits.remaining / credits.limit : 1) > 0.05
                    ? 'bg-amber-500'
                    : 'bg-red-500',
              )}
              style={{ '--bar': `${credits.limit > 0 ? Math.min(100, (credits.used / credits.limit) * 100) : 0}%` } as CSSProperties}
              role="progressbar"
              aria-valuenow={credits.used}
              aria-valuemin={0}
              aria-valuemax={credits.limit}
              aria-label={`${credits.remaining} von ${credits.limit} Credits verbleibend`}
            />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-text-secondary">
              {credits.remaining.toLocaleString('de-DE')} Credits verbleibend
            </span>
            {credits.limit > 0 && credits.remaining / credits.limit <= 0.2 && plan === 'free' && proPriceId && (
              <button
                className="text-xs text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
                onClick={() => handleUpgrade(proPriceId, 'Pro')}
              >
                Upgrade auf Pro (2.000 Credits/Monat)
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Manage subscription (portal) ── */}
      {subscription?.stripeCustomerId && (
        <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
          <h3 className="m-0 text-sm font-semibold text-text">Abonnement verwalten</h3>
          <p className="m-0 text-[13px] text-text-muted leading-relaxed">
            Ändere deinen Plan, aktualisiere Zahlungsmethoden oder kündige über das Stripe-Kundencenter.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={handlePortal}
            disabled={actionLoading === 'portal'}
          >
            {actionLoading === 'portal' ? 'Weiterleitung…' : 'Kundencenter öffnen →'}
          </Button>
        </section>
      )}

      {/* ── Upgrade options ── */}
      {stripeAvailable && plan !== 'enterprise' && (
        <section className="flex flex-col gap-3 p-5 bg-surface border border-glass-border rounded-xl">
          <h3 className="m-0 text-sm font-semibold text-text">Plan upgraden</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">

            {/* Personal — Sprint 1.6 */}
            {personalPriceId && plan === 'free' && (
              <div className="flex flex-col gap-3 p-4 bg-bg border border-glass-border rounded-lg">
                <div className="flex justify-between items-baseline">
                  <span className="text-[15px] font-bold text-emerald-500">Personal</span>
                  <span className="text-xs text-text-muted">ab 19 €/Monat</span>
                </div>
                <ul className="m-0 pl-4 text-[13px] text-text-secondary leading-[1.8]">
                  <li>500 Credits/Monat</li>
                  <li>Chat, Memory, RAG</li>
                  <li>1 Workspace</li>
                  <li>E-Mail-Support</li>
                </ul>
                <Button
                  className="w-full"
                  onClick={() => handleUpgradeTier('personal', 'Personal')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'Personal' ? 'Weiterleitung…' : 'Zu Personal upgraden'}
                </Button>
              </div>
            )}

            {/* Pro */}
            {proPriceId && plan === 'free' && (
              <div className="flex flex-col gap-3 p-4 bg-bg border border-glass-border rounded-lg">
                <div className="flex justify-between items-baseline">
                  <span className="text-[15px] font-bold text-sky-500">Pro</span>
                  <span className="text-xs text-text-muted">ab 39 €/Monat</span>
                </div>
                <ul className="m-0 pl-4 text-[13px] text-text-secondary leading-[1.8]">
                  <li>2.000 Credits/Monat</li>
                  <li>Alle Speicher-Ebenen</li>
                  <li>GraphRAG & Agenten</li>
                  <li>Priorisierter Support</li>
                </ul>
                <Button
                  className="w-full"
                  onClick={() => handleUpgradeTier('pro', 'Pro')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'Pro' ? 'Weiterleitung…' : 'Zu Pro upgraden'}
                </Button>
              </div>
            )}

            {/* Enterprise — manual sales funnel (Sprint 1.6) */}
            <div className={cn(
              'flex flex-col gap-3 p-4 bg-bg border rounded-lg',
              'border-violet-500/40 bg-violet-500/5'
            )}>
              <div className="flex justify-between items-baseline">
                <span className="text-[15px] font-bold text-violet-500">Enterprise</span>
                <span className="text-xs text-text-muted">ab 25.000 €/Jahr</span>
              </div>
              <ul className="m-0 pl-4 text-[13px] text-text-secondary leading-[1.8]">
                <li>Dedicated EU-Instance</li>
                <li>SAML SSO & Audit-Log</li>
                <li>SLA 99,9 % & DPA</li>
                <li>Unbegrenzte Credits</li>
              </ul>
              <Button
                variant="outline"
                className="w-full"
                asChild
              >
                <a href="mailto:sales@zensation.ai?subject=ZenAI%20Enterprise%20Anfrage">
                  Kontakt zu Sales →
                </a>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── No Stripe configured ── */}
      {!stripeAvailable && (
        <section className="flex flex-col gap-3 p-5 bg-transparent border border-dashed border-glass-border rounded-xl text-text-muted text-[13px]">
          <p className="m-0">
            Zahlungen sind in dieser Installation nicht konfiguriert.
            Setze <code className="font-mono text-xs px-1 py-px bg-surface-hover rounded-sm">VITE_STRIPE_PRO_PRICE_ID</code> und{' '}
            <code className="font-mono text-xs px-1 py-px bg-surface-hover rounded-sm">VITE_STRIPE_ENTERPRISE_PRICE_ID</code> um Upgrade-Optionen anzuzeigen.
          </p>
        </section>
      )}
    </div>
  );
}
