/**
 * LLM-Based Episodic Consolidation (Phase 100)
 *
 * Replaces simple string truncation with Claude Haiku extraction
 * of semantic facts from grouped episodes.
 *
 * Output format: JSON Array [{content, fact_type, confidence}]
 * Falls back to old substring method on error.
 *
 * @module services/memory/llm-consolidation
 */

import { logger } from '../../utils/logger';
import { generateClaudeResponse } from '../claude/core';

// ===========================================
// Types
// ===========================================

export interface EpisodeInput {
  id: string;
  trigger: string;
  response: string;
  retrievalStrength: number;
}

export interface ExtractedFact {
  content: string;
  fact_type: string;
  confidence: number;
}

// ===========================================
// Valid fact types
// ===========================================

const VALID_FACT_TYPES = ['preference', 'behavior', 'knowledge', 'goal', 'context'];

// ===========================================
// Fallback: Old substring method
// ===========================================

function extractFactsFallback(episodes: EpisodeInput[]): ExtractedFact[] {
  return episodes.map(ep => ({
    content: `Fruehere Interaktion: "${ep.trigger.substring(0, 100)}${ep.trigger.length > 100 ? '...' : ''}" -> ${ep.response.substring(0, 150)}${ep.response.length > 150 ? '...' : ''}`,
    fact_type: 'context',
    confidence: ep.retrievalStrength,
  }));
}

// ===========================================
// LLM-Based Extraction
// ===========================================

/**
 * Extract 1-3 semantic facts from grouped episodes using Claude Haiku.
 *
 * @param episodes - Episodes to extract facts from
 * @returns Array of extracted facts
 */
export async function extractFactsFromEpisodes(
  episodes: EpisodeInput[]
): Promise<ExtractedFact[]> {
  if (episodes.length === 0) {
    return [];
  }

  try {
    const episodeText = episodes.map((ep, i) =>
      `Episode ${i + 1}:\n  User: ${ep.trigger.substring(0, 300)}\n  AI: ${ep.response.substring(0, 500)}`
    ).join('\n\n');

    const systemPrompt = `You are a memory consolidation assistant. Given a set of past conversation episodes, extract 1-3 semantic facts that capture the most important user preferences, knowledge, or patterns. Output ONLY a JSON array of objects with fields: content (string), fact_type (one of: preference, behavior, knowledge, goal, context), confidence (number 0-1). Use the same language as the input.`;

    const userPrompt = `Episodes to consolidate:\n\n${episodeText}\n\nExtract key facts as JSON array:`;

    const response = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 400,
      temperature: 0.2,
    });

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('LLM consolidation: No JSON array in response, using fallback');
      return extractFactsFallback(episodes);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      logger.warn('LLM consolidation: Empty or invalid array, using fallback');
      return extractFactsFallback(episodes);
    }

    // Validate and sanitize facts
    const validFacts: ExtractedFact[] = parsed
      .slice(0, 3) // Max 3 facts
      .map((f: Record<string, unknown>) => ({
        content: String(f.content || ''),
        fact_type: VALID_FACT_TYPES.includes(f.fact_type as string)
          ? (f.fact_type as string)
          : 'context',
        confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.7)),
      }))
      .filter((f: ExtractedFact) => f.content.length > 0);

    if (validFacts.length === 0) {
      return extractFactsFallback(episodes);
    }

    logger.info('LLM consolidation extracted facts', {
      episodeCount: episodes.length,
      factCount: validFacts.length,
    });

    return validFacts;
  } catch (error) {
    logger.warn('LLM consolidation failed, using substring fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return extractFactsFallback(episodes);
  }
}
