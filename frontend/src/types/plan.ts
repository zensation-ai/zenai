/**
 * Plan types and feature definitions for ZenAI billing tiers.
 */

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanFeatures {
  maxIdeas: number | 'unlimited';
  maxChatPerDay: number | 'unlimited';
  contexts: number;
  advancedRag: boolean;
  multiAgent: boolean;
  voiceChat: boolean;
  graphRag: boolean;
  codeExecution: boolean;
}

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  free: {
    maxIdeas: 5,
    maxChatPerDay: 10,
    contexts: 1,
    advancedRag: false,
    multiAgent: false,
    voiceChat: false,
    graphRag: false,
    codeExecution: false,
  },
  pro: {
    maxIdeas: 'unlimited',
    maxChatPerDay: 'unlimited',
    contexts: 4,
    advancedRag: true,
    multiAgent: true,
    voiceChat: true,
    graphRag: true,
    codeExecution: true,
  },
  enterprise: {
    maxIdeas: 'unlimited',
    maxChatPerDay: 'unlimited',
    contexts: 4,
    advancedRag: true,
    multiAgent: true,
    voiceChat: true,
    graphRag: true,
    codeExecution: true,
  },
};
