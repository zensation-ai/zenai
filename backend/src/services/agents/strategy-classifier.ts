/**
 * Agent Strategy Classifier
 *
 * Extracted from agent-orchestrator.ts (Phase 119 Architecture Decomposition)
 * Contains AGENT_TEMPLATES, classifyTeamStrategy(), getAgentPipeline(),
 * and fallback chain utilities.
 */

import { logger } from '../../utils/logger';
import type { AgentRole } from '../memory/shared-memory';

// ===========================================
// Types
// ===========================================

export type TeamStrategy =
  | 'research_write_review'
  | 'research_only'
  | 'write_only'
  | 'code_solve'
  | 'research_code_review'
  | 'parallel_research'
  | 'parallel_code_review'
  | 'full_parallel'
  | 'custom';

/** Agent template definition */
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  strategy: TeamStrategy;
  pipeline?: AgentRole[];
  skipReview?: boolean;
  promptHint?: string;
}

// ===========================================
// Predefined Agent Templates
// ===========================================

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'deep_research',
    name: 'Tiefenrecherche',
    description: 'Gründliche Recherche mit Fakten-Check und Quellenanalyse',
    icon: '🔬',
    strategy: 'research_write_review',
    promptHint: 'Recherchiere gründlich und prüfe alle Fakten',
  },
  {
    id: 'blog_article',
    name: 'Blog-Artikel',
    description: 'Recherchierter Blog-Artikel mit SEO-optimiertem Aufbau',
    icon: '📝',
    strategy: 'research_write_review',
    promptHint: 'Erstelle einen gut strukturierten Blog-Artikel',
  },
  {
    id: 'code_solution',
    name: 'Code-Lösung',
    description: 'Code generieren, testen und optimieren',
    icon: '💻',
    strategy: 'code_solve',
    promptHint: 'Implementiere eine funktionierende Code-Lösung',
  },
  {
    id: 'competitive_analysis',
    name: 'Wettbewerbsanalyse',
    description: 'Markt- und Wettbewerbsanalyse mit Empfehlungen',
    icon: '📊',
    strategy: 'research_write_review',
    promptHint: 'Analysiere den Wettbewerb und gib strategische Empfehlungen',
  },
  {
    id: 'email_draft',
    name: 'E-Mail verfassen',
    description: 'Professionelle E-Mail basierend auf Kontext',
    icon: '✉️',
    strategy: 'write_only',
    skipReview: false,
    promptHint: 'Verfasse eine professionelle E-Mail',
  },
  {
    id: 'code_review',
    name: 'Code-Review',
    description: 'Code analysieren, Bugs finden, Verbesserungen vorschlagen',
    icon: '🔍',
    strategy: 'research_code_review',
    promptHint: 'Analysiere den Code und schlage Verbesserungen vor',
  },
  {
    id: 'quick_summary',
    name: 'Schnelle Zusammenfassung',
    description: 'Schnelle Recherche und kompakte Zusammenfassung',
    icon: '⚡',
    strategy: 'research_only',
    promptHint: 'Fasse die wichtigsten Punkte zusammen',
  },
  {
    id: 'strategy_paper',
    name: 'Strategiepapier',
    description: 'Umfassende Analyse mit Strategieempfehlung',
    icon: '🎯',
    strategy: 'research_write_review',
    promptHint: 'Erstelle ein detailliertes Strategiepapier mit Handlungsempfehlungen',
  },
];

// ===========================================
// Task Classification
// ===========================================

/**
 * Determine the best strategy for a task based on its nature
 */
export function classifyTeamStrategy(task: string): TeamStrategy {
  const taskLower = task.toLowerCase();

  // Code-heavy patterns
  const codePatterns = [
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded optional groups, no backtracking risk
    /schreib(?:e|t)? (?:mir )?(?:eine?n? |den |das )?code/,
    /implementier(e|en)/,
    /programmier(e|en)/,
    /code.*schreib/,
    /python.*(script|programm|code)/,
    /javascript.*funktion/,
    /typescript.*implementierung/,
    /erstelle? .*(shell|bash|python|node).*script/,
    /debug(ge|gen)?/,
    /fix(e|en)? .*bug/,
    /algorithmus/,
    /funktion.*erstell/,
  ];

  // Research + Code patterns
  const researchCodePatterns = [
    /analysiere.*code/,
    /code.*review/,
    /code.*prüf/,
    /überprüf.*implementierung/,
    /such.*fehler.*code/,
    /optimier.*code/,
  ];

  // Research-heavy patterns
  const researchPatterns = [
    /recherchiere/,
    /finde (heraus|informationen)/,
    /was (weiß ich|habe ich) (über|zu|zum)/,
    /suche nach/,
    /sammle (informationen|daten|fakten)/,
  ];

  // Write-heavy patterns
  const writePatterns = [
    /schreibe? (mir |eine[mnrs]? )/,
    /erstelle? (mir |eine[mnrs]? )/,
    /formuliere/,
    /verfasse/,
    /entwirf/,
  ];

  // Full pipeline patterns (research + write + review)
  const fullPipelinePatterns = [
    /analysiere.*und.*(erstelle|schreibe|fasse)/,
    /recherchiere.*und.*(erstelle|schreibe|verfasse)/,
    /(strategie|konzept|plan|bericht|report)/,
    /vergleiche.*und.*bewerte/,
    /gib.*überblick.*und.*empf/,
    /zusammenfass.*und.*empfehl/,
  ];

  // Parallel research patterns
  const parallelResearchPatterns = [
    /parallel.*recherchier/,
    /recherchier.*parallel/,
    /mehrere\s+quellen.*gleichzeitig/,
    /aus\s+verschiedenen\s+quellen.*recherchier/,
  ];

  // Parallel code + research patterns
  const parallelCodePatterns = [
    /implementier.*und.*recherchier.*gleichzeitig/,
    /code.*und.*recherch.*parallel/,
    /parallel.*code.*und.*recherch/,
  ];

  // Check parallel patterns first
  for (const pattern of parallelCodePatterns) {
    if (pattern.test(taskLower)) {
      return 'parallel_code_review';
    }
  }

  for (const pattern of parallelResearchPatterns) {
    if (pattern.test(taskLower)) {
      return 'parallel_research';
    }
  }

  // Check research + code patterns first
  for (const pattern of researchCodePatterns) {
    if (pattern.test(taskLower)) {
      return 'research_code_review';
    }
  }

  // Check code-only patterns
  for (const pattern of codePatterns) {
    if (pattern.test(taskLower)) {
      return 'code_solve';
    }
  }

  // Check full pipeline (most complex)
  for (const pattern of fullPipelinePatterns) {
    if (pattern.test(taskLower)) {
      return 'research_write_review';
    }
  }

  // Check research-only
  for (const pattern of researchPatterns) {
    if (pattern.test(taskLower)) {
      return 'research_only';
    }
  }

  // Check write-only
  for (const pattern of writePatterns) {
    if (pattern.test(taskLower)) {
      return 'write_only';
    }
  }

  // Default: full pipeline for complex tasks
  if (taskLower.length > 100) {
    return 'research_write_review';
  }

  return 'research_write_review';
}

/**
 * Get the agent pipeline for a strategy
 */
export function getAgentPipeline(strategy: TeamStrategy, skipReview?: boolean): AgentRole[] {
  switch (strategy) {
    case 'research_only':
      return ['researcher'];
    case 'write_only':
      return skipReview ? ['writer'] : ['writer', 'reviewer'];
    case 'research_write_review':
      return skipReview ? ['researcher', 'writer'] : ['researcher', 'writer', 'reviewer'];
    case 'code_solve':
      return skipReview ? ['coder'] : ['coder', 'reviewer'];
    case 'research_code_review':
      return ['researcher', 'coder', 'reviewer'];
    case 'parallel_research':
      return ['researcher', 'researcher', 'writer', 'reviewer'];
    case 'parallel_code_review':
      return ['coder', 'researcher', 'reviewer'];
    case 'full_parallel':
      return ['researcher', 'coder', 'writer', 'reviewer'];
    case 'custom':
      return []; // Will be provided by customPipeline
  }
}

// ===========================================
// Graceful Degradation — Fallback Chains (Phase 114, Task 52)
// ===========================================

/**
 * A fallback chain defines an ordered list of models to try on failure.
 */
export interface FallbackChain {
  /** Ordered list of model names (primary first, cheapest last) */
  models: string[];
  /** Current index in the chain (0 = primary) */
  currentIndex: number;
}

/** Default model fallback chain: powerful -> standard -> fast */
export const DEFAULT_MODEL_FALLBACK_CHAIN: string[] = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
];

/** Fast model fallback chain: standard -> fast (skip opus) */
export const FAST_MODEL_FALLBACK_CHAIN: string[] = [
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
];

/**
 * Create a new fallback chain starting at a given model.
 */
export function createFallbackChain(primaryModel?: string, chain?: string[]): FallbackChain {
  const models = chain ?? DEFAULT_MODEL_FALLBACK_CHAIN;
  const idx = primaryModel ? models.indexOf(primaryModel) : 0;
  return {
    models,
    currentIndex: idx >= 0 ? idx : 0,
  };
}

/**
 * Execute a function with fallback chain logic.
 */
export async function executeWithFallback<T>(
  chain: FallbackChain,
  executor: (model: string) => Promise<T>,
  label = 'operation',
): Promise<T> {
  const modelsToTry = chain.models.slice(chain.currentIndex);

  let lastError: Error | null = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      if (i > 0) {
        logger.info('Fallback chain: trying next model', {
          operation: 'fallback-chain',
          label,
          model,
          attempt: i + 1,
          totalModels: modelsToTry.length,
        });
      }
      return await executor(model);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn('Fallback chain: model failed, trying next', {
        operation: 'fallback-chain',
        label,
        model,
        error: lastError.message,
        hasNext: i < modelsToTry.length - 1,
      });
    }
  }

  const finalError = lastError ?? new Error('All fallback models failed');
  logger.error('Fallback chain exhausted: all models failed', finalError, {
    operation: 'fallback-chain',
    label,
    modelsAttempted: modelsToTry.join(','),
  });
  throw finalError;
}

/**
 * Execute a list of tool calls with graceful degradation.
 */
export async function executeToolsWithFallback<T>(
  tools: string[],
  executor: (toolName: string) => Promise<T>,
  label = 'tools',
): Promise<Array<{ toolName: string; result: T }>> {
  const results: Array<{ toolName: string; result: T }> = [];

  for (const toolName of tools) {
    try {
      const result = await executor(toolName);
      results.push({ toolName, result });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn('Tool failed in fallback execution, skipping', {
        operation: 'tool-fallback',
        label,
        toolName,
        error: errMsg,
      });
    }
  }

  return results;
}
