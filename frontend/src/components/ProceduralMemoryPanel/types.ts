/**
 * ProceduralMemoryPanel Types
 *
 * Shared interfaces for the ProceduralMemoryPanel component family.
 * Phase 59: Memory Excellence (Letta-Paradigm)
 */

export interface Procedure {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  tools_used: string[];
  outcome: 'success' | 'failure' | 'partial';
  success_rate: number;
  execution_count: number;
  feedback_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  source: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface RecallResult {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
  tools_used: string[];
  outcome: string;
  success_rate: number;
  similarity: number;
}

export interface ProceduralMemoryPanelProps {
  context: string;
}

export const OUTCOME_STYLES: Record<string, { color: string; label: string }> = {
  success: { color: '#22c55e', label: 'Erfolgreich' },
  failure: { color: '#ef4444', label: 'Fehlgeschlagen' },
  partial: { color: '#f59e0b', label: 'Teilweise' },
};
