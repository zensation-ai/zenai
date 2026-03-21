/**
 * usePlanFeatures — Returns the current user's plan tier and feature access.
 *
 * Stub implementation: reads from JWT claims or demo flag in localStorage.
 * All pro features are unlocked in demo mode.
 * Upgrade path: decode JWT `plan` claim once billing backend is wired.
 */

import { useMemo } from 'react';
import type { PlanTier, PlanFeatures } from '../types/plan';
import { PLAN_FEATURES } from '../types/plan';

function getPlanFromToken(): PlanTier {
  // Check demo mode first
  if (typeof window !== 'undefined' && localStorage.getItem('zenai_demo') === 'true') {
    return 'pro';
  }

  // Try to decode JWT claim (stub — will be server-verified in production)
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('zenai_token') : null;
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const plan = payload?.plan as PlanTier | undefined;
        if (plan && ['free', 'pro', 'enterprise'].includes(plan)) {
          return plan;
        }
      }
    }
  } catch {
    // Invalid token — fall through to free
  }

  return 'free';
}

export interface UsePlanFeaturesResult {
  tier: PlanTier;
  features: PlanFeatures;
  isDemo: boolean;
  /** True if the user has at least the given minimum plan tier */
  hasPlan: (minPlan: PlanTier) => boolean;
}

const TIER_ORDER: PlanTier[] = ['free', 'pro', 'enterprise'];

export function usePlanFeatures(): UsePlanFeaturesResult {
  const tier = useMemo(() => getPlanFromToken(), []);
  const isDemo = typeof window !== 'undefined' && localStorage.getItem('zenai_demo') === 'true';

  const hasPlan = useMemo(() => (minPlan: PlanTier) => {
    return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minPlan);
  }, [tier]);

  return {
    tier,
    features: PLAN_FEATURES[tier],
    isDemo,
    hasPlan,
  };
}
