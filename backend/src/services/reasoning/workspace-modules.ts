/**
 * Workspace Modules — 8 specialist modules for the GWT Engine
 * Phase 127, Task 3
 *
 * Each module implements the WorkspaceModule interface. Dynamic imports are
 * used for service dependencies to avoid circular-dependency issues and to
 * allow graceful degradation when services are unavailable.
 *
 * NOTE: Most generateContent() implementations are stubs for this phase.
 * Real content wiring happens in Task 5 (chat pipeline integration).
 *
 * @module services/reasoning/workspace-modules
 */

import { logger } from '../../utils/logger';
import type {
  WorkspaceModule,
  QueryAnalysis,
  SalienceResult,
  ModuleContext,
} from './global-workspace';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Clamp a value to [0, 1] */
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// ─── 1. CoreMemoryModule ──────────────────────────────────────────────────────

/**
 * Core Memory module — always included.
 *
 * Provides the [KERN-GEDÄCHTNIS] section: user profile, current goals,
 * preferences, and working context. These 4 blocks are the fundamental
 * "who the user is" context that should be present in every conversation.
 */
export class CoreMemoryModule implements WorkspaceModule {
  readonly id = 'core-memory';
  readonly name = 'Kern-Gedächtnis';
  readonly alwaysInclude = true;

  async computeSalience(
    _query: string,
    _analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    return {
      score: 1.0,
      reasoning: 'Core memory is always maximally relevant',
      estimatedTokens: 600,
    };
  }

  async generateContent(
    _query: string,
    _tokenBudget: number,
    context: ModuleContext,
  ): Promise<string> {
    try {
      const { getCoreMemoryBlocks, buildCoreMemoryPromptSection } =
        await import('../memory/core-memory');

      const blocks = await getCoreMemoryBlocks(
        context.aiContext as Parameters<typeof getCoreMemoryBlocks>[0],
        context.userId,
      );

      return buildCoreMemoryPromptSection(blocks);
    } catch (err) {
      logger.warn('CoreMemoryModule: could not load core memory blocks', { error: String(err) });
      return '';
    }
  }
}

// ─── 2. WorkingMemoryModule ───────────────────────────────────────────────────

/**
 * Working Memory module — active focus / slots.
 *
 * Salience:
 *   0.6 base (almost always relevant — user is in the middle of something)
 *   +0.2 if isFollowUp (continuing a task that is already in working memory)
 *   +0.2 if working memory has active slots (stubbed as not applicable here)
 */
export class WorkingMemoryModule implements WorkspaceModule {
  readonly id = 'working-memory';
  readonly name = 'Arbeitsgedächtnis';
  readonly alwaysInclude = false;

  async computeSalience(
    _query: string,
    analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    let score = 0.6;
    const reasons: string[] = ['base=0.6'];

    if (analysis.isFollowUp) {
      score += 0.2;
      reasons.push('+0.2 follow-up');
    }

    score = clamp01(score);
    return {
      score,
      reasoning: reasons.join(', '),
      estimatedTokens: 300,
    };
  }

  async generateContent(
    _query: string,
    _tokenBudget: number,
    context: ModuleContext,
  ): Promise<string> {
    // Stub: real integration in Task 5
    return `[Working Memory: active slots for session ${context.sessionId}]`;
  }
}

// ─── 3. LongTermFactsModule ───────────────────────────────────────────────────

/**
 * Long-Term Facts module — personal facts from LTM.
 *
 * Salience:
 *   0.3  base
 *   0.9  if intent is 'recall' (user explicitly asks about past facts)
 *   0.7  if domain matches a known context domain
 */
const KNOWN_FACT_DOMAINS = new Set(['personal', 'work', 'learning', 'creative']);

export class LongTermFactsModule implements WorkspaceModule {
  readonly id = 'long-term-facts';
  readonly name = 'Langzeit-Fakten';
  readonly alwaysInclude = false;

  async computeSalience(
    _query: string,
    analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    let score = 0.3;
    const reasons: string[] = ['base=0.3'];

    if (analysis.intent === 'recall') {
      score = 0.9;
      reasons.push('recall intent → 0.9');
    } else if (KNOWN_FACT_DOMAINS.has(analysis.domain)) {
      score = 0.7;
      reasons.push(`domain=${analysis.domain} → 0.7`);
    }

    score = clamp01(score);
    return {
      score,
      reasoning: reasons.join(', '),
      estimatedTokens: 500,
    };
  }

  async generateContent(
    query: string,
    _tokenBudget: number,
    _context: ModuleContext,
  ): Promise<string> {
    // Stub: real LTM query in Task 5
    return `[Long-Term Facts: retrieved facts relevant to "${query.slice(0, 40)}"]`;
  }
}

// ─── 4. EpisodicMemoryModule ──────────────────────────────────────────────────

/**
 * Episodic Memory module — concrete past experiences.
 *
 * Salience:
 *   0.2  base
 *   +0.5 if temporalReference === 'past'
 *   +0.3 if intent === 'recall'
 *   +0.2 if isFollowUp
 */
export class EpisodicMemoryModule implements WorkspaceModule {
  readonly id = 'episodic-memory';
  readonly name = 'Episodisches Gedächtnis';
  readonly alwaysInclude = false;

  async computeSalience(
    _query: string,
    analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    let score = 0.2;
    const reasons: string[] = ['base=0.2'];

    if (analysis.temporalReference === 'past') {
      score += 0.5;
      reasons.push('+0.5 past temporal');
    }

    if (analysis.intent === 'recall') {
      score += 0.3;
      reasons.push('+0.3 recall intent');
    }

    if (analysis.isFollowUp) {
      score += 0.2;
      reasons.push('+0.2 follow-up');
    }

    score = clamp01(score);
    return {
      score,
      reasoning: reasons.join(', '),
      estimatedTokens: 400,
    };
  }

  async generateContent(
    _query: string,
    _tokenBudget: number,
    _context: ModuleContext,
  ): Promise<string> {
    return '[Episodic: retrieved episodes]';
  }
}

// ─── 5. RAGModule ─────────────────────────────────────────────────────────────

/**
 * RAG (Retrieval-Augmented Generation) module — document knowledge base.
 *
 * Salience:
 *   0.5  base
 *   +0.3 if intent === 'question'
 *   +0.2 if complexity > 0.5
 *   -0.2 if intent === 'creative' (creative tasks don't need RAG)
 */
export class RAGModule implements WorkspaceModule {
  readonly id = 'rag';
  readonly name = 'Dokument-Retrieval (RAG)';
  readonly alwaysInclude = false;

  async computeSalience(
    _query: string,
    analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    let score = 0.5;
    const reasons: string[] = ['base=0.5'];

    if (analysis.intent === 'question') {
      score += 0.3;
      reasons.push('+0.3 question intent');
    }

    if (analysis.complexity > 0.5) {
      score += 0.2;
      reasons.push('+0.2 high complexity');
    }

    if (analysis.intent === 'creative') {
      score -= 0.2;
      reasons.push('-0.2 creative intent');
    }

    score = clamp01(score);
    return {
      score,
      reasoning: reasons.join(', '),
      estimatedTokens: 800,
    };
  }

  async generateContent(
    _query: string,
    _tokenBudget: number,
    _context: ModuleContext,
  ): Promise<string> {
    return '[RAG: retrieved documents]';
  }
}

// ─── 6. KnowledgeGraphModule ──────────────────────────────────────────────────

/**
 * Knowledge Graph module — entity relationships and concept network.
 *
 * Salience:
 *   0.3  base
 *   +0.4 if entityMentions.length > 1 (relational / conceptual query)
 *   +0.2 if intent === 'question'
 */
export class KnowledgeGraphModule implements WorkspaceModule {
  readonly id = 'knowledge-graph';
  readonly name = 'Wissensgraph';
  readonly alwaysInclude = false;

  async computeSalience(
    _query: string,
    analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    let score = 0.3;
    const reasons: string[] = ['base=0.3'];

    if (analysis.entityMentions.length > 1) {
      score += 0.4;
      reasons.push(`+0.4 multiple entities (${analysis.entityMentions.length})`);
    }

    if (analysis.intent === 'question') {
      score += 0.2;
      reasons.push('+0.2 question intent');
    }

    score = clamp01(score);
    return {
      score,
      reasoning: reasons.join(', '),
      estimatedTokens: 400,
    };
  }

  async generateContent(
    _query: string,
    _tokenBudget: number,
    _context: ModuleContext,
  ): Promise<string> {
    return '[KG: entity relations]';
  }
}

// ─── 7. CalendarContextModule ─────────────────────────────────────────────────

/**
 * Calendar Context module — upcoming events and schedules.
 *
 * Salience:
 *   0.1  base (calendar is rarely relevant)
 *   +0.6 if temporalReference === 'future'
 *   +0.4 if domain === 'personal' AND there's a temporal reference
 *   +0.3 if query mentions meeting/termin/kalender/calendar/schedule
 */
const CALENDAR_KEYWORDS_RE = /\b(meeting|termin|kalender|calendar|schedule|besprechung|treffen)\b/i;

export class CalendarContextModule implements WorkspaceModule {
  readonly id = 'calendar-context';
  readonly name = 'Kalender-Kontext';
  readonly alwaysInclude = false;

  async computeSalience(
    query: string,
    analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    let score = 0.1;
    const reasons: string[] = ['base=0.1'];

    if (analysis.temporalReference === 'future') {
      score += 0.6;
      reasons.push('+0.6 future temporal');
    }

    if (analysis.domain === 'personal' && analysis.temporalReference !== null) {
      score += 0.4;
      reasons.push('+0.4 personal domain + temporal reference');
    }

    if (CALENDAR_KEYWORDS_RE.test(query)) {
      score += 0.3;
      reasons.push('+0.3 calendar keyword');
    }

    score = clamp01(score);
    return {
      score,
      reasoning: reasons.join(', '),
      estimatedTokens: 300,
    };
  }

  async generateContent(
    _query: string,
    _tokenBudget: number,
    _context: ModuleContext,
  ): Promise<string> {
    return '[Calendar: upcoming events]';
  }
}

// ─── 8. ProceduralMemoryModule ────────────────────────────────────────────────

/**
 * Procedural Memory module — "how to do X" knowledge from past actions.
 *
 * Salience:
 *   0.2  base
 *   +0.6 if intent === 'task' (user wants to DO something)
 *   +0.2 if domain === 'code'
 */
export class ProceduralMemoryModule implements WorkspaceModule {
  readonly id = 'procedural-memory';
  readonly name = 'Prozedurales Gedächtnis';
  readonly alwaysInclude = false;

  async computeSalience(
    _query: string,
    analysis: QueryAnalysis,
    _context: ModuleContext,
  ): Promise<SalienceResult> {
    let score = 0.2;
    const reasons: string[] = ['base=0.2'];

    if (analysis.intent === 'task') {
      score += 0.6;
      reasons.push('+0.6 task intent');
    }

    if (analysis.domain === 'code') {
      score += 0.2;
      reasons.push('+0.2 code domain');
    }

    score = clamp01(score);
    return {
      score,
      reasoning: reasons.join(', '),
      estimatedTokens: 300,
    };
  }

  async generateContent(
    _query: string,
    _tokenBudget: number,
    _context: ModuleContext,
  ): Promise<string> {
    return '[Procedural: relevant procedures]';
  }
}

// ─── Module registry ──────────────────────────────────────────────────────────

/**
 * The canonical list of all workspace modules.
 *
 * Order within this array does NOT affect selection — modules are ranked
 * by their dynamic salience scores at runtime. CoreMemoryModule is always
 * included regardless of order.
 */
export const ALL_WORKSPACE_MODULES: WorkspaceModule[] = [
  new CoreMemoryModule(),
  new WorkingMemoryModule(),
  new LongTermFactsModule(),
  new EpisodicMemoryModule(),
  new RAGModule(),
  new KnowledgeGraphModule(),
  new CalendarContextModule(),
  new ProceduralMemoryModule(),
];
