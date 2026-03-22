/**
 * Long-Term Memory Consolidation & Decay Functions
 *
 * Extracted from long-term-memory.ts (Phase 121 Architecture Decomposition)
 * Contains pattern/fact extraction from sessions, decay rate conversion,
 * and recent session retrieval logic.
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { queryClaudeJSON } from '../claude';
import { safeJsonParse } from './ltm-utils';
import type {
  PersonalizationFact,
  FrequentPattern,
  ConversationMessage,
  SessionWithMessages,
  DecayClass,
} from './long-term-memory';

// ===========================================
// Internal Types
// ===========================================

/** AI-extracted pattern from conversations */
interface ExtractedPattern {
  patternType?: 'topic' | 'action' | 'style';
  pattern: string;
  confidence?: number;
  associatedTopics?: string[];
}

/** AI-extracted fact about the user */
interface ExtractedFact {
  factType?: 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context';
  content: string;
  confidence?: number;
}

// ===========================================
// Configuration
// ===========================================

const MIN_FACT_CONFIDENCE = 0.6;

// ===========================================
// Session Retrieval
// ===========================================

/**
 * Get recent conversation sessions for consolidation.
 */
export async function getRecentSessions(
  context: AIContext,
  hours: number
): Promise<SessionWithMessages[]> {
  const result = await queryContext(
    context,
    `SELECT id, messages, metadata, compressed_summary
     FROM conversation_sessions
     WHERE context = $1
       AND last_activity >= NOW() - ($2 || ' hours')::INTERVAL
     ORDER BY last_activity DESC`,
    [context, hours]
  );

  return result.rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    messages: typeof r.messages === 'string'
      ? safeJsonParse<ConversationMessage[]>(r.messages, [])
      : (r.messages as ConversationMessage[]) || [],
    metadata: typeof r.metadata === 'string'
      ? safeJsonParse<Record<string, unknown>>(r.metadata, {})
      : (r.metadata as Record<string, unknown>) || {},
    summary: r.compressed_summary as string | undefined,
  }));
}

// ===========================================
// Pattern Extraction
// ===========================================

/**
 * Extract recurring patterns from sessions using Claude.
 */
export async function extractPatterns(
  sessions: SessionWithMessages[],
  _context: AIContext
): Promise<FrequentPattern[]> {
  // Combine all messages for analysis
  const allMessages = sessions.flatMap(s => s.messages);

  if (allMessages.length < 5) {
    return [];
  }

  // Extract user messages
  const userMessages = allMessages
    .filter((m: ConversationMessage) => m.role === 'user')
    .map((m: ConversationMessage) => m.content)
    .join('\n');

  try {
    const patternsPrompt = `Analysiere diese Nutzer-Nachrichten und identifiziere wiederkehrende Muster:

${userMessages.substring(0, 3000)}

Identifiziere:
1. Häufige Themen oder Interessen
2. Wiederkehrende Fragemuster
3. Bevorzugte Formulierungen oder Stile

Antworte als JSON:
{
  "patterns": [
    {
      "patternType": "topic|action|style",
      "pattern": "Beschreibung des Musters",
      "confidence": 0.7,
      "associatedTopics": ["topic1", "topic2"]
    }
  ]
}`;

    const result = await queryClaudeJSON<{ patterns: ExtractedPattern[] }>(
      'Du analysierst Konversationsmuster. Antworte nur mit JSON.',
      patternsPrompt
    );

    return (result.patterns || []).map((p: ExtractedPattern) => ({
      id: uuidv4(),
      patternType: p.patternType || 'topic',
      pattern: p.pattern,
      frequency: 1,
      lastUsed: new Date(),
      associatedTopics: p.associatedTopics || [],
      confidence: p.confidence || 0.5,
    }));
  } catch (error) {
    logger.debug('Pattern extraction failed', { error });
    return [];
  }
}

// ===========================================
// Fact Extraction
// ===========================================

/**
 * Infer the appropriate decay class for a fact based on its type and source.
 */
export function inferDecayClass(factType: string, source: string): DecayClass {
  // Explicit goals and core identity facts should persist
  if (factType === 'goal' && source === 'explicit') { return 'permanent'; }

  // Explicit preferences are stable
  if (factType === 'preference' && source === 'explicit') { return 'slow_decay'; }

  // Knowledge from user is durable
  if (factType === 'knowledge' && source === 'explicit') { return 'slow_decay'; }

  // Consolidated facts have been verified
  if (source === 'consolidated') { return 'normal_decay'; }

  // Behaviors and context change fast
  if (factType === 'behavior') { return 'normal_decay'; }
  if (factType === 'context') { return 'fast_decay'; }

  // Default for inferred knowledge
  return 'normal_decay';
}

/**
 * Extract facts about the user from sessions using Claude.
 */
export async function extractFacts(
  sessions: SessionWithMessages[],
  _context: AIContext
): Promise<PersonalizationFact[]> {
  const allMessages = sessions.flatMap(s => s.messages);
  const userMessages = allMessages
    .filter((m: ConversationMessage) => m.role === 'user')
    .map((m: ConversationMessage) => m.content)
    .join('\n');

  if (userMessages.length < 100) {
    return [];
  }

  try {
    const factsPrompt = `Extrahiere Fakten über den Nutzer aus diesen Nachrichten:

${userMessages.substring(0, 3000)}

Extrahiere:
1. Präferenzen (was mag der Nutzer?)
2. Wissen/Expertise (was weiß der Nutzer?)
3. Ziele (was will der Nutzer erreichen?)
4. Kontext (Beruf, Umfeld, Situation)

Antworte als JSON:
{
  "facts": [
    {
      "factType": "preference|behavior|knowledge|goal|context",
      "content": "Kurze, präzise Beschreibung",
      "confidence": 0.8
    }
  ]
}`;

    const result = await queryClaudeJSON<{ facts: ExtractedFact[] }>(
      'Du extrahierst Fakten über Nutzer aus Konversationen. Antworte nur mit JSON.',
      factsPrompt
    );

    return (result.facts || [])
      .filter((f: ExtractedFact) => (f.confidence ?? 0) >= MIN_FACT_CONFIDENCE)
      .map((f: ExtractedFact) => {
        const factType = (f.factType || 'knowledge') as PersonalizationFact['factType'];
        return {
          id: uuidv4(),
          factType,
          content: f.content,
          confidence: f.confidence || 0.5,
          source: 'inferred' as const,
          firstSeen: new Date(),
          lastConfirmed: new Date(),
          occurrences: 1,
          retrievalCount: 0,
          lastRetrieved: null,
          decayClass: inferDecayClass(factType, 'inferred'),
        };
      });
  } catch (error) {
    logger.debug('Fact extraction failed', { error });
    return [];
  }
}

// ===========================================
// Decay Helpers
// ===========================================

/**
 * Convert a legacy per-day decay rate to an Ebbinghaus stability value.
 * Stability S such that e^(-1/S) ~= decayRate (retention after 1 day).
 * From: decayRate = e^(-1/S) => S = -1 / ln(decayRate)
 */
export function decayRateToStability(decayRate: number): number {
  if (decayRate >= 1.0) {return 365;} // permanent
  if (decayRate <= 0) {return 0.1;}
  return Math.max(0.1, Math.min(365, -1.0 / Math.log(decayRate)));
}
