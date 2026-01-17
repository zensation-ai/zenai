/**
 * AI Service - Unified AI interface with automatic fallback
 *
 * Priority order:
 * 1. Claude (if ANTHROPIC_API_KEY configured) - Primary
 * 2. Ollama (if available locally) - Local fallback
 * 3. Basic fallback (no AI)
 *
 * Note: Embeddings use OpenAI or Ollama (Claude doesn't support embeddings)
 */

import { logger } from '../utils/logger';
import { isClaudeAvailable, structureWithClaude, structureWithClaudePersonalized, generateClaudeResponse } from './claude';
import { isOpenAIAvailable, generateOpenAIEmbedding } from './openai';
import { structureWithOllama, generateEmbedding as generateOllamaEmbedding, StructuredIdea } from '../utils/ollama';
import { AIContext } from '../utils/database-context';

/**
 * Structure a transcript into a structured idea
 * Falls back through: Claude → Ollama → Basic
 */
export async function structureIdea(transcript: string): Promise<StructuredIdea> {
  // Try Claude first (primary)
  if (isClaudeAvailable()) {
    try {
      logger.info('Structuring with Claude');
      return await structureWithClaude(transcript);
    } catch (error: any) {
      logger.warn('Claude structuring failed, falling back to Ollama', { error: error.message });
    }
  }

  // Try Ollama as fallback (local)
  try {
    logger.info('Structuring with Ollama');
    return await structureWithOllama(transcript);
  } catch (error: any) {
    logger.warn('Ollama structuring failed, using basic fallback', { error: error.message });
  }

  // Basic fallback - no AI
  logger.info('Using basic structuring fallback');
  return {
    title: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
    type: 'idea',
    category: 'personal',
    priority: 'medium',
    summary: transcript.substring(0, 200),
    next_steps: [],
    context_needed: [],
    keywords: [],
  };
}

/**
 * Structure a transcript with personalized context
 * Uses business profile, learning insights, and recent topics for better results
 * Falls back through: Claude (personalized) → Claude (basic) → Ollama → Basic
 */
export async function structureIdeaPersonalized(
  transcript: string,
  context: AIContext
): Promise<StructuredIdea> {
  // Try Claude with personalization first (primary)
  if (isClaudeAvailable()) {
    try {
      logger.info('Structuring with Claude (personalized)', { context });
      return await structureWithClaudePersonalized(transcript, context);
    } catch (error: any) {
      logger.warn('Claude personalized structuring failed, trying basic Claude', { error: error.message });

      // Try basic Claude as fallback
      try {
        return await structureWithClaude(transcript);
      } catch (basicError: any) {
        logger.warn('Claude basic structuring also failed, falling back to Ollama', { error: basicError.message });
      }
    }
  }

  // Try Ollama as fallback (local)
  try {
    logger.info('Structuring with Ollama');
    return await structureWithOllama(transcript);
  } catch (error: any) {
    logger.warn('Ollama structuring failed, using basic fallback', { error: error.message });
  }

  // Basic fallback - no AI
  logger.info('Using basic structuring fallback');
  return {
    title: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
    type: 'idea',
    category: 'personal',
    priority: 'medium',
    summary: transcript.substring(0, 200),
    next_steps: [],
    context_needed: [],
    keywords: [],
  };
}

/**
 * Generate embedding for text
 * Falls back through: OpenAI → Ollama → Empty
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Try OpenAI first
  if (isOpenAIAvailable()) {
    try {
      logger.info('Generating embedding with OpenAI');
      return await generateOpenAIEmbedding(text);
    } catch (error: any) {
      logger.warn('OpenAI embedding failed, falling back to Ollama', { error: error.message });
    }
  }

  // Try Ollama as fallback
  try {
    logger.info('Generating embedding with Ollama');
    return await generateOllamaEmbedding(text);
  } catch (error: any) {
    logger.warn('Ollama embedding failed, returning empty', { error: error.message });
  }

  // Return empty embedding as final fallback
  return [];
}

/**
 * Generate a text summary
 * Falls back through: Claude → Basic
 */
export async function generateSummary(text: string, maxLength: number = 200): Promise<string> {
  // Try Claude first
  if (isClaudeAvailable()) {
    try {
      const systemPrompt = `Du bist ein Zusammenfassungs-Assistent. Erstelle eine prägnante Zusammenfassung des gegebenen Textes in maximal ${maxLength} Zeichen. Antworte nur mit der Zusammenfassung, ohne zusätzliche Erklärungen.`;
      logger.info('Generating summary with Claude');
      return await generateClaudeResponse(systemPrompt, text);
    } catch (error: any) {
      logger.warn('Claude summary failed, using basic fallback', { error: error.message });
    }
  }

  // Basic fallback - just truncate
  return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
}

/**
 * Extract keywords from text
 * Falls back through: Claude → Basic
 */
export async function extractKeywords(text: string, maxKeywords: number = 5): Promise<string[]> {
  // Try Claude first
  if (isClaudeAvailable()) {
    try {
      const systemPrompt = `Du bist ein Keyword-Extraktions-Assistent. Extrahiere die ${maxKeywords} wichtigsten Keywords aus dem gegebenen Text. Antworte nur mit einem JSON-Array von Strings, z.B. ["keyword1", "keyword2"].`;
      logger.info('Extracting keywords with Claude');
      const response = await generateClaudeResponse(systemPrompt, text);
      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const keywords = JSON.parse(jsonMatch[0]);
        return Array.isArray(keywords) ? keywords.slice(0, maxKeywords) : [];
      }
    } catch (error: any) {
      logger.warn('Claude keyword extraction failed, using basic fallback', { error: error.message });
    }
  }

  // Basic fallback - split on common words and take most frequent
  const words = text.toLowerCase()
    .replace(/[^a-zäöüß\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  const frequency: Record<string, number> = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Get information about which AI services are available
 */
export function getAvailableServices(): {
  claude: boolean;
  openai: boolean;
  ollama: boolean;
  primary: 'claude' | 'ollama' | 'basic';
} {
  const claude = isClaudeAvailable();
  const openai = isOpenAIAvailable(); // Still used for embeddings
  const primary = claude ? 'claude' : 'ollama';

  return {
    claude,
    openai,
    ollama: true, // Optimistic - we'll check on actual use
    primary
  };
}
