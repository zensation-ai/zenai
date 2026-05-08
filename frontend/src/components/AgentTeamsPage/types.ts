/**
 * AgentTeamsPage Types
 *
 * Shared interfaces and constants for the AgentTeamsPage component family.
 * Phase 45 + 60 + 64 + 121
 */

import type { AIContext } from '../ContextSwitcher';

export interface AgentResult {
  role: string;
  success: boolean;
  toolsUsed: string[];
  executionTimeMs: number;
  error?: string;
}

export interface TeamResult {
  teamId: string;
  finalOutput: string;
  strategy: string;
  agents: AgentResult[];
  stats: {
    executionTimeMs: number;
    totalTokens: { input: number; output: number } | number;
    sharedMemoryEntries: number;
  };
}

export interface HistoryEntry {
  id: string;
  teamId: string;
  task: string;
  strategy: string;
  finalOutput: string;
  agents: AgentResult[];
  executionTimeMs: number;
  tokens: { input: number; output: number } | number;
  success: boolean;
  savedAsIdeaId?: string;
  createdAt: string;
  status?: string;
  checkpointStep?: number;
  pauseReason?: string;
}

export const EXECUTION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  running: { label: 'Läuft', color: '#3b82f6' },
  completed: { label: 'Abgeschlossen', color: '#22c55e' },
  failed: { label: 'Fehlgeschlagen', color: '#ef4444' },
  paused: { label: 'Pausiert', color: '#f59e0b' },
  awaiting_approval: { label: 'Genehmigung nötig', color: 'var(--accent-orange)' },
  cancelled: { label: 'Abgebrochen', color: '#9ca3af' },
};

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  strategy: string;
  pipeline?: string[];
  skipReview?: boolean;
  promptHint?: string;
}

export interface StreamEvent {
  type: string;
  teamId?: string;
  strategy?: string;
  pipeline?: string[];
  agentRole?: string;
  agentIndex?: number;
  totalAgents?: number;
  subTask?: string;
  result?: Partial<AgentResult>;
  finalOutput?: string;
  error?: string;
  // Full result payload
  success?: boolean;
  agents?: AgentResult[];
  stats?: {
    executionTimeMs: number;
    totalTokens: { input: number; output: number };
    sharedMemoryEntries: number;
  };
}

export type Strategy = 'research_write_review' | 'research_only' | 'write_only' | 'code_solve' | 'research_code_review' | 'custom';

export const STRATEGIES: { id: Strategy; label: string; icon: string; desc: string }[] = [
  { id: 'research_write_review', label: 'Komplett', icon: '🔬', desc: 'Recherche, Schreiben, Review' },
  { id: 'research_only', label: 'Recherche', icon: '🔍', desc: 'Nur Informationen sammeln' },
  { id: 'write_only', label: 'Schreiben', icon: '✍️', desc: 'Nur Content erstellen' },
  { id: 'code_solve', label: 'Code', icon: '💻', desc: 'Code generieren & testen' },
  { id: 'research_code_review', label: 'Code-Review', icon: '🔍', desc: 'Code analysieren & verbessern' },
  { id: 'custom', label: 'Angepasst', icon: '🛠️', desc: 'Eigene Pipeline' },
];

export const ROLE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  researcher: { icon: '🔍', label: 'Researcher', color: '#3b82f6' },
  writer: { icon: '✍️', label: 'Writer', color: '#1a6b7a' },
  reviewer: { icon: '📋', label: 'Reviewer', color: '#22c55e' },
  coder: { icon: '💻', label: 'Coder', color: '#f59e0b' },
};

export type AgentTab = 'my-agents' | 'create' | 'marketplace' | 'analytics' | 'workflows' | 'a2a';

export const AGENT_TABS: { id: AgentTab; label: string; icon: string }[] = [
  { id: 'my-agents', label: 'Meine Agents', icon: '🤖' },
  { id: 'create', label: 'Erstellen', icon: '✨' },
  { id: 'marketplace', label: 'Marketplace', icon: '🏪' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'workflows', label: 'Workflows', icon: '🔄' },
  { id: 'a2a', label: 'A2A', icon: '🌐' },
];

// Blueprint types
export interface AgentBlueprint {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  tags: string[];
  type: 'autonomous' | 'team_task' | 'hybrid';
  triggers: Array<{ type: string; config: Record<string, unknown> }>;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
  approvalRequired: boolean;
  tools: string[];
  instructions: string;
  source: 'built_in' | 'user_created' | 'community' | 'nl_generated';
  rating: number | null;
  usageCount: number;
  defaultContext?: string;
}

export interface GeneratedBlueprint {
  blueprint: Partial<AgentBlueprint>;
  confidence: number;
  reasoning: string;
  warnings: string[];
}

export interface RatingHistogram {
  total: number;
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface BlueprintDetail extends AgentBlueprint {
  instructions: string;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
  approvalRequired: boolean;
  featured: boolean;
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  moderationReason?: string | null;
  histogram: RatingHistogram;
  recentReviews: Array<{
    id: string;
    rating: number;
    review: string | null;
    createdAt: string;
  }>;
  ratingCount?: number;
}

export interface PublishCandidate {
  blueprintId: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  icon: string;
  tools: string[];
  approvalRequired: boolean;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
}

export interface AgentSystemStats {
  totalAgents: number;
  activeAgents: number;
  totalExecutionsToday: number;
  totalTokensToday: number;
  overallSuccessRate: number;
  topPerformingAgent: { id: string; name: string; successRate: number } | null;
  mostUsedAgent: { id: string; name: string; executionCount: number } | null;
  tokenBudgetUtilization: number;
}

export interface AgentTeamsPageProps {
  context: AIContext;
  onBack?: () => void;
  embedded?: boolean;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTokens(tokens: { input: number; output: number } | number): string {
  if (typeof tokens === 'number') return tokens.toLocaleString('de-DE');
  return (tokens.input + tokens.output).toLocaleString('de-DE');
}
