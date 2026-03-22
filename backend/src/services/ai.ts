/**
 * AI Service - Unified AI interface with automatic fallback
 *
 * Priority order:
 * 1. Claude (if ANTHROPIC_API_KEY configured) - Primary
 * 2. Ollama (if available locally) - Local fallback
 * 3. Basic fallback (no AI)
 *
 * Embeddings priority:
 * 1. Ollama (nomic-embed-text, 768 dimensions) - Local, fast
 * 2. OpenAI (text-embedding-3-small, 768 dimensions) - Cloud fallback
 *
 * @module services/ai
 */

import { logger } from '../utils/logger';
import { isClaudeAvailable, structureWithClaude, structureWithClaudePersonalized, generateClaudeResponse } from './claude';
import { structureWithOllama, generateEmbedding as generateOllamaEmbedding, StructuredIdea } from '../utils/ollama';
import { isMistralAvailable, structureWithMistral, generateMistralEmbedding } from './mistral';
import { AIContext } from '../utils/database-context';
import OpenAI from 'openai';

// ===========================================
// Configuration Constants
// ===========================================

/** Configuration for AI service behavior */
const AI_CONFIG = {
  /** Maximum length for generated titles */
  maxTitleLength: 50,
  /** Maximum length for generated summaries */
  maxSummaryLength: 200,
  /** Default category when AI is unavailable */
  defaultCategory: 'personal' as const,
  /** Default type when AI is unavailable */
  defaultType: 'idea' as const,
  /** Default priority when AI is unavailable */
  defaultPriority: 'medium' as const,
  /** Minimum word length for keyword extraction */
  minKeywordLength: 3,
  /** OpenAI embedding model */
  openaiEmbeddingModel: 'text-embedding-3-small' as const,
  /** Embedding dimensions (matches Ollama nomic-embed-text) */
  embeddingDimensions: 768,
} as const;

// ===========================================
// OpenAI Client (lazy initialization)
// ===========================================

let openaiClient: OpenAI | null = null;

/**
 * Get or create OpenAI client instance
 * Only initializes if OPENAI_API_KEY is configured
 */
function getOpenAIClient(): OpenAI | null {
  if (openaiClient) {return openaiClient;}

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Check if OpenAI is available
 */
function isOpenAIAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Generate embedding using OpenAI text-embedding-3-small
 * Returns 768-dimensional vector to match Ollama format
 */
async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client not available');
  }

  const response = await client.embeddings.create({
    model: AI_CONFIG.openaiEmbeddingModel,
    input: text,
    dimensions: AI_CONFIG.embeddingDimensions,
  });

  return response.data[0].embedding;
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Safely extracts error message from unknown error type
 * Provides type-safe error handling without using 'any'
 *
 * @param error - The caught error of unknown type
 * @returns Error message string
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * Creates a basic fallback structured idea when AI services are unavailable
 * Centralizes fallback logic to avoid code duplication
 *
 * @param transcript - The raw transcript text
 * @returns A basic structured idea with default values
 */
function createBasicFallbackIdea(transcript: string): StructuredIdea {
  const {
    maxTitleLength,
    maxSummaryLength,
    defaultType,
    defaultCategory,
    defaultPriority
  } = AI_CONFIG;

  return {
    title: transcript.substring(0, maxTitleLength) + (transcript.length > maxTitleLength ? '...' : ''),
    type: defaultType,
    category: defaultCategory,
    priority: defaultPriority,
    summary: transcript.substring(0, maxSummaryLength),
    next_steps: [],
    context_needed: [],
    keywords: [],
  };
}

/**
 * Validates that transcript input is non-empty
 *
 * @param transcript - The input transcript
 * @throws Error if transcript is empty or only whitespace
 */
function validateTranscript(transcript: string): void {
  if (!transcript || !transcript.trim()) {
    throw new Error('Transcript cannot be empty');
  }
}

// ===========================================
// Main AI Functions
// ===========================================

/**
 * Structure a transcript into a structured idea
 * Falls back through: Claude → Mistral → Ollama → Basic
 *
 * @param transcript - The raw transcript text to structure
 * @returns Structured idea with title, type, category, etc.
 */
export async function structureIdea(transcript: string): Promise<StructuredIdea> {
  validateTranscript(transcript);

  // Try Claude first (primary)
  if (isClaudeAvailable()) {
    try {
      logger.info('Structuring with Claude', { operation: 'structureIdea' });
      return await structureWithClaude(transcript);
    } catch (error: unknown) {
      logger.warn('Claude structuring failed, falling back to Mistral', {
        error: getErrorMessage(error),
        operation: 'structureIdea'
      });
    }
  }

  // Try Mistral as cloud fallback
  if (isMistralAvailable()) {
    try {
      logger.info('Structuring with Mistral', { operation: 'structureIdea' });
      return await structureWithMistral(transcript);
    } catch (error: unknown) {
      logger.warn('Mistral structuring failed, falling back to Ollama', {
        error: getErrorMessage(error),
        operation: 'structureIdea'
      });
    }
  }

  // Try Ollama as local fallback
  try {
    logger.info('Structuring with Ollama', { operation: 'structureIdea' });
    return await structureWithOllama(transcript);
  } catch (error: unknown) {
    logger.warn('Ollama structuring failed, using basic fallback', {
      error: getErrorMessage(error),
      operation: 'structureIdea'
    });
  }

  // Basic fallback - no AI
  logger.info('Using basic structuring fallback', { operation: 'structureIdea' });
  return createBasicFallbackIdea(transcript);
}

/**
 * Structure a transcript with personalized context
 * Uses business profile, learning insights, and recent topics for better results
 * Falls back through: Claude (personalized) → Claude (basic) → Mistral → Ollama → Basic
 *
 * @param transcript - The raw transcript text to structure
 * @param context - The AI context (personal/work) for personalization
 * @returns Structured idea with personalized categorization
 */
export async function structureIdeaPersonalized(
  transcript: string,
  context: AIContext
): Promise<StructuredIdea> {
  validateTranscript(transcript);

  // Try Claude with personalization first (primary)
  if (isClaudeAvailable()) {
    try {
      logger.info('Structuring with Claude (personalized)', {
        context,
        operation: 'structureIdeaPersonalized'
      });
      return await structureWithClaudePersonalized(transcript, context);
    } catch (error: unknown) {
      logger.warn('Claude personalized structuring failed, trying basic Claude', {
        error: getErrorMessage(error),
        operation: 'structureIdeaPersonalized'
      });

      // Try basic Claude as fallback
      try {
        return await structureWithClaude(transcript);
      } catch (basicError: unknown) {
        logger.warn('Claude basic structuring also failed, falling back to Mistral', {
          error: getErrorMessage(basicError),
          operation: 'structureIdeaPersonalized'
        });
      }
    }
  }

  // Try Mistral as cloud fallback
  if (isMistralAvailable()) {
    try {
      logger.info('Structuring with Mistral', { operation: 'structureIdeaPersonalized' });
      return await structureWithMistral(transcript);
    } catch (error: unknown) {
      logger.warn('Mistral structuring failed, falling back to Ollama', {
        error: getErrorMessage(error),
        operation: 'structureIdeaPersonalized'
      });
    }
  }

  // Try Ollama as local fallback
  try {
    logger.info('Structuring with Ollama', { operation: 'structureIdeaPersonalized' });
    return await structureWithOllama(transcript);
  } catch (error: unknown) {
    logger.warn('Ollama structuring failed, using basic fallback', {
      error: getErrorMessage(error),
      operation: 'structureIdeaPersonalized'
    });
  }

  // Basic fallback - no AI
  logger.info('Using basic structuring fallback', { operation: 'structureIdeaPersonalized' });
  return createBasicFallbackIdea(transcript);
}

/**
 * Generate embedding for text
 * Falls back through: Ollama → OpenAI → Mistral → empty array
 *
 * @param text - The text to generate embedding for
 * @returns 768-dimensional embedding vector, or empty array on failure
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    logger.warn('Empty text provided for embedding generation', { operation: 'generateEmbedding' });
    return [];
  }

  // Try Ollama first (local, fast)
  try {
    logger.debug('Generating embedding with Ollama', { operation: 'generateEmbedding' });
    const embedding = await generateOllamaEmbedding(text);
    return validateEmbedding(embedding, 'ollama');
  } catch (error: unknown) {
    logger.debug('Ollama embedding failed, trying OpenAI fallback', {
      error: getErrorMessage(error),
      operation: 'generateEmbedding'
    });
  }

  // Try OpenAI as fallback (cloud)
  if (isOpenAIAvailable()) {
    try {
      logger.debug('Generating embedding with OpenAI', { operation: 'generateEmbedding' });
      const embedding = await generateOpenAIEmbedding(text);
      const validated = validateEmbedding(embedding, 'openai');
      logger.info('OpenAI embedding generated successfully', {
        operation: 'generateEmbedding',
        dimensions: validated.length
      });
      return validated;
    } catch (error: unknown) {
      logger.warn('OpenAI embedding failed', {
        error: getErrorMessage(error),
        operation: 'generateEmbedding'
      });
    }
  }

  // Try Mistral as fallback (cloud)
  if (isMistralAvailable()) {
    try {
      logger.debug('Generating embedding with Mistral', { operation: 'generateEmbedding' });
      const embedding = await generateMistralEmbedding(text);
      const validated = validateEmbedding(embedding, 'mistral');
      logger.info('Mistral embedding generated successfully', {
        operation: 'generateEmbedding',
        dimensions: validated.length,
      });
      return validated;
    } catch (error: unknown) {
      logger.warn('Mistral embedding failed', {
        error: getErrorMessage(error),
        operation: 'generateEmbedding',
      });
    }
  }

  // Return empty embedding as final fallback
  logger.warn('All embedding providers failed', { operation: 'generateEmbedding' });
  return [];
}

/**
 * Validate an embedding vector for dimension, NaN values, and zero vectors.
 * Throws on invalid embeddings to prevent silent data corruption.
 */
function validateEmbedding(embedding: number[], provider: string): number[] {
  if (!embedding || embedding.length === 0) {
    throw new Error(`${provider}: Empty embedding returned`);
  }

  // Check for expected dimensions
  if (embedding.length !== AI_CONFIG.embeddingDimensions) {
    logger.error(`Embedding dimension mismatch from ${provider}`, undefined, {
      expected: AI_CONFIG.embeddingDimensions,
      got: embedding.length,
      operation: 'generateEmbedding',
    });
    throw new Error(`Embedding dimension mismatch: expected ${AI_CONFIG.embeddingDimensions}, got ${embedding.length}`);
  }

  // Check for NaN values
  const hasNaN = embedding.some(v => Number.isNaN(v));
  if (hasNaN) {
    throw new Error(`${provider}: Embedding contains NaN values`);
  }

  // Check for zero vector (all zeros = meaningless embedding)
  const isZero = embedding.every(v => v === 0);
  if (isZero) {
    throw new Error(`${provider}: Embedding is a zero vector`);
  }

  return embedding;
}

/**
 * Generate a text summary
 * Falls back through: Claude → Basic (truncation)
 *
 * @param text - The text to summarize
 * @param maxLength - Maximum length of the summary (default: 200)
 * @returns Summary string
 */
export async function generateSummary(text: string, maxLength: number = AI_CONFIG.maxSummaryLength): Promise<string> {
  if (!text || !text.trim()) {
    return '';
  }

  // Try Claude first
  if (isClaudeAvailable()) {
    try {
      const systemPrompt = `Du bist ein Zusammenfassungs-Assistent. Erstelle eine prägnante Zusammenfassung des gegebenen Textes in maximal ${maxLength} Zeichen. Antworte nur mit der Zusammenfassung, ohne zusätzliche Erklärungen.`;
      logger.debug('Generating summary with Claude', { operation: 'generateSummary' });
      return await generateClaudeResponse(systemPrompt, text);
    } catch (error: unknown) {
      logger.warn('Claude summary failed, using basic fallback', {
        error: getErrorMessage(error),
        operation: 'generateSummary'
      });
    }
  }

  // Basic fallback - just truncate
  return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
}

/**
 * Extract keywords from text
 * Falls back through: Claude → Basic (frequency analysis)
 *
 * @param text - The text to extract keywords from
 * @param maxKeywords - Maximum number of keywords to extract (default: 5)
 * @returns Array of keyword strings
 */
export async function extractKeywords(text: string, maxKeywords: number = 5): Promise<string[]> {
  if (!text || !text.trim()) {
    return [];
  }

  // Try Claude first
  if (isClaudeAvailable()) {
    try {
      const systemPrompt = `Du bist ein Keyword-Extraktions-Assistent. Extrahiere die ${maxKeywords} wichtigsten Keywords aus dem gegebenen Text. Antworte nur mit einem JSON-Array von Strings, z.B. ["keyword1", "keyword2"].`;
      logger.debug('Extracting keywords with Claude', { operation: 'extractKeywords' });
      const response = await generateClaudeResponse(systemPrompt, text);

      // Extract JSON array from response with safe parsing
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const keywords = JSON.parse(jsonMatch[0]);
          if (Array.isArray(keywords)) {
            return keywords
              .filter((k): k is string => typeof k === 'string')
              .slice(0, maxKeywords);
          }
        } catch (parseError: unknown) {
          logger.warn('Failed to parse keywords JSON', {
            error: getErrorMessage(parseError),
            operation: 'extractKeywords'
          });
        }
      }
    } catch (error: unknown) {
      logger.warn('Claude keyword extraction failed, using basic fallback', {
        error: getErrorMessage(error),
        operation: 'extractKeywords'
      });
    }
  }

  // Basic fallback - split on common words and take most frequent
  const words = text.toLowerCase()
    .replace(/[^a-zäöüß\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > AI_CONFIG.minKeywordLength);

  const frequency: Record<string, number> = {};
  for (const word of words) {
    frequency[word] = (frequency[word] || 0) + 1;
  }

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Get information about which AI services are available
 *
 * @returns Object indicating service availability and primary service
 */
export function getAvailableServices(): {
  claude: boolean;
  ollama: boolean;
  primary: 'claude' | 'ollama' | 'basic';
} {
  const claude = isClaudeAvailable();
  const primary = claude ? 'claude' : 'ollama';

  return {
    claude,
    ollama: true, // Optimistic - actual availability checked on use
    primary
  };
}

/**
 * Re-export StructuredIdea type for consumers
 */
export type { StructuredIdea } from '../utils/ollama';
