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
  running: { label: 'Laeuft', color: '#3b82f6' },
  completed: { label: 'Abgeschlossen', color: '#22c55e' },
  failed: { label: 'Fehlgeschlagen', color: '#ef4444' },
  paused: { label: 'Pausiert', color: '#f59e0b' },
  awaiting_approval: { label: 'Genehmigung noetig', color: '#f97316' },
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
  writer: { icon: '✍️', label: 'Writer', color: '#8b5cf6' },
  reviewer: { icon: '📋', label: 'Reviewer', color: '#22c55e' },
  coder: { icon: '💻', label: 'Coder', color: '#f59e0b' },
};

export type AgentTab = 'teams' | 'identities' | 'workflows' | 'a2a';

export const AGENT_TABS: { id: AgentTab; label: string; icon: string }[] = [
  { id: 'teams', label: 'Teams', icon: '🚀' },
  { id: 'identities', label: 'Agenten', icon: '🤖' },
  { id: 'workflows', label: 'Workflows', icon: '🔄' },
  { id: 'a2a', label: 'A2A', icon: '🌐' },
];

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
