/**
 * React Query hooks for Billing & Subscription
 *
 * Supports two modes:
 * - Legacy per-user billing (useBillingStatus, useCredits)
 * - Org-level billing (useOrgBillingStatus) — when multi-tenancy is active
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { queryKeys } from '../../lib/query-keys';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PlanTier = 'free' | 'pro' | 'enterprise';
// Sprint 1.1 (2026-04-16): 'team' → 'business' per Master-Plan v2.
export type OrgPlan = 'free' | 'personal' | 'pro' | 'business' | 'enterprise';

export interface BillingStatus {
  plan: PlanTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

export interface OrgSubscription {
  id: string;
  orgId: string;
  plan: OrgPlan;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seatCount: number;
}

export interface WorkspaceCreditSummary {
  workspaceId: string;
  workspaceName: string;
  creditsUsed: number;
  creditsLimit: number;
  seatCount: number;
}

export interface OrgBillingStatus {
  subscription: OrgSubscription;
  stripeCustomerId: string | null;
  stripeConfigured: boolean;
  workspaceCredits: WorkspaceCreditSummary[];
}

// ─────────────────────────────────────────────
// Per-User Billing (Legacy)
// ─────────────────────────────────────────────

export function useBillingStatus() {
  return useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: async ({ signal }) => {
      const res = await axios.get<{ success: boolean; data: BillingStatus }>('/api/billing/status', { signal });
      return res.data.data;
    },
    staleTime: 5 * 60_000, // 5 min — plan rarely changes mid-session
    retry: 1,
  });
}

// ─────────────────────────────────────────────
// Credits (Per-User, Legacy)
// ─────────────────────────────────────────────

export interface UserCredits {
  remaining: number;
  used: number;
  limit: number;
  plan: PlanTier;
}

export function useCredits() {
  return useQuery({
    queryKey: queryKeys.billing.credits(),
    queryFn: async ({ signal }) => {
      const res = await axios.get<{ success: boolean; data: UserCredits }>('/api/billing/credits', { signal });
      return res.data.data;
    },
    staleTime: 60_000, // 1 min — credits change with each AI interaction
    retry: 1,
  });
}

// ─────────────────────────────────────────────
// Org-Level Billing (Multi-Tenancy)
// ─────────────────────────────────────────────

export function useOrgBillingStatus(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.billing.org(orgId ?? ''),
    queryFn: async ({ signal }) => {
      const res = await axios.get<{ success: boolean; data: OrgBillingStatus }>(
        `/api/billing/org/${orgId}/status`,
        { signal },
      );
      return res.data.data;
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
