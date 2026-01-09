/**
 * AI Service - Unified AI interface with automatic fallback
 *
 * Priority order:
 * 1. OpenAI (if API key configured)
 * 2. Ollama (if available locally)
 * 3. Basic fallback (no AI)
 */

import { logger } from '../utils/logger';
import { isOpenAIAvailable, structureWithOpenAI, generateOpenAIEmbedding, generateOpenAIResponse } from './openai';
import { structureWithOllama, generateEmbedding as generateOllamaEmbedding, StructuredIdea } from '../utils/ollama';

/**
 * Structure a transcript into a structured idea
 * Falls back through: OpenAI → Ollama → Basic
 */
export async function structureIdea(transcript: string): Promise<StructuredIdea> {
  // Try OpenAI first
  if (isOpenAIAvailable()) {
    try {
      logger.info('Structuring with OpenAI');
      return await structureWithOpenAI(transcript);
    } catch (error: any) {
      logger.warn('OpenAI structuring failed, falling back to Ollama', { error: error.message });
    }
  }

  // Try Ollama as fallback
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
 * Falls back through: OpenAI → Ollama → Basic
 */
export async function generateSummary(text: string, maxLength: number = 200): Promise<string> {
  // Try OpenAI first
  if (isOpenAIAvailable()) {
    try {
      const systemPrompt = `Du bist ein Zusammenfassungs-Assistent. Erstelle eine prägnante Zusammenfassung des gegebenen Textes in maximal ${maxLength} Zeichen. Antworte nur mit der Zusammenfassung, ohne zusätzliche Erklärungen.`;
      logger.info('Generating summary with OpenAI');
      return await generateOpenAIResponse(systemPrompt, text);
    } catch (error: any) {
      logger.warn('OpenAI summary failed, using basic fallback', { error: error.message });
    }
  }

  // Basic fallback - just truncate
  return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
}

/**
 * Extract keywords from text
 * Falls back through: OpenAI → Ollama → Basic
 */
export async function extractKeywords(text: string, maxKeywords: number = 5): Promise<string[]> {
  // Try OpenAI first
  if (isOpenAIAvailable()) {
    try {
      const systemPrompt = `Du bist ein Keyword-Extraktions-Assistent. Extrahiere die ${maxKeywords} wichtigsten Keywords aus dem gegebenen Text. Antworte nur mit einem JSON-Array von Strings, z.B. ["keyword1", "keyword2"].`;
      logger.info('Extracting keywords with OpenAI');
      const response = await generateOpenAIResponse(systemPrompt, text);
      const keywords = JSON.parse(response);
      return Array.isArray(keywords) ? keywords.slice(0, maxKeywords) : [];
    } catch (error: any) {
      logger.warn('OpenAI keyword extraction failed, using basic fallback', { error: error.message });
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
  openai: boolean;
  ollama: boolean;
  primary: 'openai' | 'ollama' | 'basic';
} {
  const openai = isOpenAIAvailable();
  const primary = openai ? 'openai' : 'ollama'; // We'll assume Ollama might work, actual check happens on use

  return {
    openai,
    ollama: true, // Optimistic - we'll check on actual use
    primary
  };
}
