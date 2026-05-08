/**
 * RequiresPlan — Feature-Gate-Komponente
 *
 * Renders children only when the user's active plan meets the minimum
 * requirement. Otherwise renders an upgrade prompt (or a custom fallback).
 *
 * Usage:
 *   <RequiresPlan plan="pro">
 *     <AdvancedFeature />
 *   </RequiresPlan>
 *
 *   <RequiresPlan plan="enterprise" fallback={<p>Nur für Enterprise-Kunden</p>}>
 *     <EnterpriseDashboard />
 *   </RequiresPlan>
 */

import type { ReactNode } from 'react';
import { useBillingStatus, type PlanTier } from '../hooks/queries/useBilling';

const TIER_ORDER: PlanTier[] = ['free', 'pro', 'enterprise'];

function meetsRequirement(userPlan: PlanTier, required: PlanTier): boolean {
  return TIER_ORDER.indexOf(userPlan) >= TIER_ORDER.indexOf(required);
}

const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

interface RequiresPlanProps {
  /** Minimum plan required to see the children */
  plan: 'pro' | 'enterprise';
  children: ReactNode;
  /** Custom content shown when plan is insufficient. Defaults to an upgrade prompt. */
  fallback?: ReactNode;
}

export function RequiresPlan({ plan, children, fallback }: RequiresPlanProps) {
  const { data: billing, isLoading } = useBillingStatus();

  // While loading, show nothing to avoid flicker
  if (isLoading) return null;

  const userPlan = billing?.plan ?? 'free';

  if (meetsRequirement(userPlan, plan)) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div className="requires-plan-gate">
      <span className="requires-plan-gate__icon">🔒</span>
      <p className="requires-plan-gate__text">
        Diese Funktion ist ab dem <strong>{PLAN_LABELS[plan]}-Plan</strong> verfügbar.
      </p>
      <a className="requires-plan-gate__link" href="/system/benutzer/billing">
        Plan upgraden →
      </a>
    </div>
  );
}
