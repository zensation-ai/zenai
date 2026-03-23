import type { OAuthTokens, AIContext } from '../types';
import type { RuleCondition } from '../../proactive-decision-engine';

export type { AIContext };

export interface SlackConnectorTokens extends OAuthTokens {
  botUserId: string;
  teamId: string;
  teamName: string;
}

export interface ProactiveConfig {
  enabled: boolean;
  confidenceThreshold: number;
  rateLimitMinutes: number;
  mutedChannels: string[];
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  confidenceThreshold: 0.8,
  rateLimitMinutes: 30,
  mutedChannels: [],
};

export interface SlackWorkspace {
  id: string;
  userId: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  channelContextMapping: Record<string, AIContext>;
  proactiveConfig: ProactiveConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackChannel {
  id: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  isMember: boolean;
  targetContext: AIContext;
  lastSyncCursor: string | null;
  muted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackMessage {
  id: string;
  channelId: string;
  messageTs: string;
  threadTs: string | null;
  userId: string;
  userName: string;
  text: string;
  extractedFacts: string[];
  importanceScore: number;
  createdAt: Date;
}

export interface SlackWorkflowTemplate {
  name: string;
  description: string;
  eventTypes: string[];
  conditions: RuleCondition[];
  decision: 'notify' | 'prepare_context' | 'take_action' | 'trigger_agent';
  actionConfig: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}

export interface SlackSyncJobData {
  userId: string;
  connectorId: 'slack';
  workspaceId: string;
  fullSync: boolean;
  channelIds?: string[];
}

/** Default channel name -> context mapping heuristics */
export const DEFAULT_CHANNEL_CONTEXT_MAP: Record<string, AIContext> = {
  engineering: 'work',
  product: 'work',
  sales: 'work',
  ops: 'work',
  random: 'personal',
  general: 'personal',
  watercooler: 'personal',
  'off-topic': 'personal',
  learning: 'learning',
  'book-club': 'learning',
  til: 'learning',
  courses: 'learning',
  brainstorm: 'creative',
  design: 'creative',
  ideas: 'creative',
  creative: 'creative',
};

/** Determine context for a channel name using heuristics */
export function inferChannelContext(channelName: string): AIContext {
  const normalized = channelName.replace(/^#/, '').toLowerCase();
  for (const [pattern, context] of Object.entries(DEFAULT_CHANNEL_CONTEXT_MAP)) {
    if (normalized.includes(pattern)) {
      return context;
    }
  }
  return 'work'; // default
}
