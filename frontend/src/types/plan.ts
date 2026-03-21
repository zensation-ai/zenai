/**
 * Plan types and feature definitions for ZenAI billing tiers.
 */

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanFeatures {
  monthlyCredits: number | 'unlimited';
  contexts: number;
  advancedRag: boolean;
  multiAgent: boolean;
  voiceChat: boolean;
  graphRag: boolean;
  codeExecution: boolean;
}

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  free: {
    monthlyCredits: 50,
    contexts: 1,
    advancedRag: false,
    multiAgent: false,
    voiceChat: false,
    graphRag: false,
    codeExecution: false,
  },
  pro: {
    monthlyCredits: 2000,
    contexts: 4,
    advancedRag: true,
    multiAgent: true,
    voiceChat: true,
    graphRag: true,
    codeExecution: true,
  },
  enterprise: {
    monthlyCredits: 'unlimited',
    contexts: 4,
    advancedRag: true,
    multiAgent: true,
    voiceChat: true,
    graphRag: true,
    codeExecution: true,
  },
};

export const CREDIT_COSTS = {
  simpleMessage: 1,
  ragMessage: 2,
  toolMessage: 3,
  multiAgent: 5,
  voicePerMinute: 2,
  codeExecution: 3,
} as const;
