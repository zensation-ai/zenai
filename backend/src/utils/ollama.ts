/**
 * Ollama LLM Integration Utilities
 *
 * Provides functions for:
 * - Structuring transcripts into ideas
 * - Generating embeddings
 * - Generic JSON queries
 *
 * @module utils/ollama
 */

import axios, { AxiosError } from 'axios';
import { getCachedEmbedding } from './cache';
import { logger } from './logger';
import { OLLAMA, TIMEOUTS } from '../config/constants';
import { withCircuitBreaker, withRetry, isCircuitOpen } from './retry';
import { generateOpenAIEmbedding, isOpenAIAvailable } from '../services/openai';

// ===========================================
// Configuration
// ===========================================

const OLLAMA_URL = process.env.OLLAMA_URL || OLLAMA.DEFAULT_URL;
const MODEL = process.env.OLLAMA_MODEL || OLLAMA.TEXT_MODEL;
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || OLLAMA.EMBEDDING_MODEL;

// Track if Ollama has been determined unreachable (reduces log noise on Railway)
let ollamaUnreachableLogged = false;

/** Ollama generation options */
const GENERATION_OPTIONS = {
  num_predict: 500,
  temperature: 0.3,
  top_p: 0.9,
} as const;

/** Extended generation options for larger outputs */
const EXTENDED_GENERATION_OPTIONS = {
  num_predict: 1000,
  temperature: 0.3,
  top_p: 0.9,
} as const;

/**
 * Retry configuration for Ollama API calls
 * Uses quietMode to reduce log noise when Ollama is not running (common on Railway)
 */
const OLLAMA_RETRY_CONFIG = {
  maxRetries: 2,
  initialDelay: 500,
  maxDelay: 5000,
  timeout: TIMEOUTS.LLM_GENERATION_MS,
  isRetryable: (error: unknown): boolean => {
    if (error instanceof AxiosError) {
      // Network errors are retryable
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return true;
      }
      // Server errors (5xx) are retryable
      if (error.response?.status && error.response.status >= 500) {
        return true;
      }
    }
    return false;
  },
  context: 'ollama-api',
  quietMode: true, // Reduce log noise - Ollama often not running on Railway
};

/**
 * Execute Ollama call with circuit breaker and retry protection
 */
async function executeOllamaWithProtection<T>(
  fn: () => Promise<T>,
  circuitKey: 'ollama' | 'ollama-embedding' = 'ollama'
): Promise<T> {
  return withCircuitBreaker(circuitKey, async () => {
    return withRetry(fn, OLLAMA_RETRY_CONFIG);
  });
}

// ===========================================
// Types
// ===========================================

/** Structure for Ollama model response */
interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
}

/** Ollama API response structure */
interface OllamaTagsResponse {
  models?: OllamaModel[];
}

/** Ollama generate response structure */
interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  context?: number[];
}

/** Ollama embeddings response structure */
interface OllamaEmbeddingsResponse {
  embedding: number[];
}

// ===========================================
// System Prompt
// ===========================================

// System Prompt with Prompt Caching (cached across requests)
export const SYSTEM_PROMPT = `Du bist ein Gedankenstrukturierer für hochintelligente Menschen.
Deine Aufgabe: Sprachmemos in strukturierte Ideen umwandeln.

WICHTIG:
- Antworte NUR mit validem JSON
- Keine zusätzlichen Erklärungen
- Keine Markdown-Formatierung

OUTPUT FORMAT (JSON):
{
  "title": "Prägnante Überschrift (max 10 Wörter)",
  "type": "idea|task|insight|problem|question",
  "category": "business|technical|personal|learning",
  "priority": "low|medium|high",
  "summary": "1-2 Sätze Zusammenfassung",
  "next_steps": ["Schritt 1", "Schritt 2"],
  "context_needed": ["Kontext 1", "Kontext 2"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

// ===========================================
// Structured Idea Interface
// ===========================================

export interface StructuredIdea {
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: 'low' | 'medium' | 'high';
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
}

// ===========================================
// Valid Values (Database Constraints)
// ===========================================

const VALID_CATEGORIES = ['business', 'technical', 'personal', 'learning'] as const;
const VALID_TYPES = ['idea', 'task', 'insight', 'problem', 'question'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

type ValidCategory = typeof VALID_CATEGORIES[number];
type ValidType = typeof VALID_TYPES[number];
type ValidPriority = typeof VALID_PRIORITIES[number];

// ===========================================
// Category Mapping
// ===========================================

// Category mapping for common LLM outputs that don't match our schema
const CATEGORY_MAPPING: Record<string, ValidCategory> = {
  // Business-related (including German/Work-specific)
  'marketing': 'business',
  'sales': 'business',
  'strategy': 'business',
  'strategie': 'business',
  'finance': 'business',
  'management': 'business',
  'startup': 'business',
  'product': 'business',
  'growth': 'business',
  'operations': 'business',
  'kunden': 'business',
  'ews': 'business',
  '1komma5': 'business',
  'team': 'business',
  'vertrieb': 'business',
  'verkauf': 'business',
  // Technical-related
  'development': 'technical',
  'engineering': 'technical',
  'code': 'technical',
  'programming': 'technical',
  'software': 'technical',
  'infrastructure': 'technical',
  'devops': 'technical',
  'architecture': 'technical',
  'technik': 'technical',
  'tech': 'technical',
  'it': 'technical',
  // Personal-related
  'health': 'personal',
  'wellness': 'personal',
  'lifestyle': 'personal',
  'family': 'personal',
  'relationships': 'personal',
  'hobby': 'personal',
  'creativity': 'personal',
  'privat': 'personal',
  'persönlich': 'personal',
  'familie': 'personal',
  'gesundheit': 'personal',
  // Learning-related
  'education': 'learning',
  'research': 'learning',
  'study': 'learning',
  'training': 'learning',
  'skills': 'learning',
  'lernen': 'learning',
  'weiterbildung': 'learning',
  'forschung': 'learning',
};

// ===========================================
// Helper Functions
// ===========================================

/**
 * Safely extracts error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    return error.message || 'Axios request failed';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Normalize category to valid database value
 *
 * @param category - Raw category string from LLM
 * @returns Valid category value
 */
export function normalizeCategory(category: string | undefined): ValidCategory {
  if (!category) {return 'personal';}

  // Handle pipe-separated categories (e.g., "EwS|Strategie|Business")
  // Take the first part or find the first matching category
  const parts = category.split('|').map(p => p.toLowerCase().trim());

  for (const part of parts) {
    // Direct match
    if (VALID_CATEGORIES.includes(part as ValidCategory)) {
      return part as ValidCategory;
    }

    // Check mapping
    const mapped = CATEGORY_MAPPING[part];
    if (mapped) {
      return mapped;
    }
  }

  // Default fallback
  return 'business';
}

/**
 * Normalize type to valid database value
 *
 * @param type - Raw type string from LLM
 * @returns Valid type value
 */
export function normalizeType(type: string | undefined): ValidType {
  if (!type) {return 'idea';}

  const lower = type.toLowerCase().trim();

  if (VALID_TYPES.includes(lower as ValidType)) {
    return lower as ValidType;
  }

  return 'idea';
}

/**
 * Normalize priority to valid database value
 *
 * @param priority - Raw priority string from LLM
 * @returns Valid priority value
 */
export function normalizePriority(priority: string | undefined): ValidPriority {
  if (!priority) {return 'medium';}

  const lower = priority.toLowerCase().trim();

  if (VALID_PRIORITIES.includes(lower as ValidPriority)) {
    return lower as ValidPriority;
  }

  return 'medium';
}

/**
 * Creates a fallback structured idea when LLM fails
 */
function createFallbackIdea(transcript: string): StructuredIdea {
  return {
    title: 'Unstrukturierte Notiz',
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
 * Safely parses a string array from parsed JSON
 */
function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {return [];}
  return value.filter((item): item is string => typeof item === 'string');
}

// ===========================================
// Main Functions
// ===========================================

/**
 * Structure a transcript using Ollama LLM
 * Now with circuit breaker and retry protection
 *
 * @param transcript - Raw transcript text
 * @returns Structured idea object
 */
export async function structureWithOllama(transcript: string): Promise<StructuredIdea> {
  // Check circuit breaker before attempting
  if (isCircuitOpen('ollama')) {
    logger.warn('Ollama circuit breaker is open, using fallback', {
      operation: 'structureWithOllama'
    });
    return createFallbackIdea(transcript);
  }

  const prompt = `${SYSTEM_PROMPT}

USER MEMO:
${transcript}

STRUCTURED OUTPUT:`;

  try {
    const response = await executeOllamaWithProtection(async () => {
      return axios.post<OllamaGenerateResponse>(
        `${OLLAMA_URL}/api/generate`,
        {
          model: MODEL,
          prompt,
          stream: false,
          options: GENERATION_OPTIONS,
        },
        { timeout: TIMEOUTS.LLM_GENERATION_MS }
      );
    }, 'ollama');

    const responseText = response.data.response.trim();

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Normalize fields to ensure they match database constraints
    return {
      title: typeof parsed.title === 'string' ? parsed.title : 'Unstrukturierte Notiz',
      type: normalizeType(parsed.type as string | undefined),
      category: normalizeCategory(parsed.category as string | undefined),
      priority: normalizePriority(parsed.priority as string | undefined),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      next_steps: parseStringArray(parsed.next_steps),
      context_needed: parseStringArray(parsed.context_needed),
      keywords: parseStringArray(parsed.keywords),
    };
  } catch (error: unknown) {
    // Check if this is a connection error (Ollama not running)
    const isConnectionError = error instanceof AxiosError &&
      (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET');

    if (isConnectionError) {
      if (!ollamaUnreachableLogged) {
        logger.warn('Ollama service unreachable - using fallback structuring', {
          operation: 'structureWithOllama',
          url: OLLAMA_URL,
        });
        ollamaUnreachableLogged = true;
      } else {
        logger.debug('Ollama structuring skipped (service unreachable)', {
          operation: 'structureWithOllama',
        });
      }
    } else {
      logger.error('Ollama structuring error', error instanceof Error ? error : undefined, {
        operation: 'structureWithOllama',
        errorMessage: getErrorMessage(error)
      });
    }

    return createFallbackIdea(transcript);
  }
}

/**
 * Generate embedding with Redis caching
 * Embeddings are cached for 7 days to avoid recomputation
 *
 * @param text - Text to generate embedding for
 * @returns 768-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    return [];
  }
  // Use cached version if available
  return getCachedEmbedding(text, generateEmbeddingUncached);
}

/**
 * Generate embedding without caching (internal use)
 * Priority: OpenAI (production) > Ollama (local development)
 */
async function generateEmbeddingUncached(text: string): Promise<number[]> {
  // Priority 1: Try OpenAI if available (works in production)
  if (isOpenAIAvailable()) {
    try {
      const embedding = await generateOpenAIEmbedding(text);
      logger.debug('Embedding generated via OpenAI', {
        operation: 'generateEmbedding',
        provider: 'openai',
        dimensions: embedding.length,
      });
      return embedding;
    } catch (error: unknown) {
      logger.warn('OpenAI embedding failed, falling back to Ollama', {
        operation: 'generateEmbedding',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fall through to Ollama
    }
  }

  // Priority 2: Try Ollama (local development)
  // Check circuit breaker before attempting
  if (isCircuitOpen('ollama-embedding')) {
    logger.debug('Ollama embedding circuit breaker is open', {
      operation: 'generateEmbedding'
    });
    return [];
  }

  try {
    const response = await executeOllamaWithProtection(async () => {
      return axios.post<OllamaEmbeddingsResponse>(
        `${OLLAMA_URL}/api/embeddings`,
        {
          model: EMBEDDING_MODEL,
          prompt: text,
        },
        { timeout: TIMEOUTS.STANDARD_MS }
      );
    }, 'ollama-embedding');

    const embedding = response.data.embedding;

    // Validate embedding is an array of numbers
    if (!Array.isArray(embedding)) {
      logger.warn('Invalid embedding response from Ollama', { operation: 'generateEmbedding' });
      return [];
    }

    logger.debug('Embedding generated via Ollama', {
      operation: 'generateEmbedding',
      provider: 'ollama',
      dimensions: embedding.length,
    });
    return embedding;
  } catch (error: unknown) {
    // Check if this is a connection error (Ollama not running)
    const isConnectionError = error instanceof AxiosError &&
      (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET');

    if (isConnectionError) {
      // Log as debug only (not warning) to reduce noise - OpenAI is the primary provider
      if (!ollamaUnreachableLogged) {
        logger.debug('Ollama service not available (expected in production)', {
          operation: 'generateEmbedding',
          url: OLLAMA_URL,
        });
        ollamaUnreachableLogged = true;
      }
    } else {
      // Unexpected error - log as warning
      logger.warn('Ollama embedding error', {
        operation: 'generateEmbedding',
        errorMessage: getErrorMessage(error)
      });
    }
    return [];
  }
}

/**
 * Check Ollama service health
 *
 * @returns Object with availability status and list of models
 */
export async function checkOllamaHealth(): Promise<{ available: boolean; models: string[] }> {
  try {
    const response = await axios.get<OllamaTagsResponse>(
      `${OLLAMA_URL}/api/tags`,
      { timeout: TIMEOUTS.QUICK_MS }
    );

    const models = response.data.models?.map((m) => m.name) || [];
    return { available: true, models };
  } catch (error: unknown) {
    logger.debug('Ollama health check failed', {
      operation: 'checkOllamaHealth',
      errorMessage: getErrorMessage(error)
    });
    return { available: false, models: [] };
  }
}

/**
 * Generic LLM call that returns parsed JSON
 * Use this for custom prompts that don't follow the StructuredIdea format
 * Now with circuit breaker and retry protection
 *
 * @param prompt - The prompt to send to the LLM
 * @returns Parsed JSON response or null on error
 */
export async function queryOllamaJSON<T = unknown>(prompt: string): Promise<T | null> {
  // Check circuit breaker before attempting
  if (isCircuitOpen('ollama')) {
    logger.warn('Ollama circuit breaker is open', { operation: 'queryOllamaJSON' });
    return null;
  }

  try {
    const response = await executeOllamaWithProtection(async () => {
      return axios.post<OllamaGenerateResponse>(
        `${OLLAMA_URL}/api/generate`,
        {
          model: MODEL,
          prompt,
          stream: false,
          options: EXTENDED_GENERATION_OPTIONS,
        },
        { timeout: TIMEOUTS.LLM_GENERATION_MS }
      );
    }, 'ollama');

    const responseText = response.data.response.trim();

    // Try to extract JSON from response
    // Handle both array and object formats
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    const objectMatch = responseText.match(/\{[\s\S]*\}/);

    let jsonStr = responseText;
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    } else if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    return JSON.parse(jsonStr) as T;
  } catch (error: unknown) {
    logger.error('Ollama JSON query error', error instanceof Error ? error : undefined, {
      operation: 'queryOllamaJSON',
      errorMessage: getErrorMessage(error)
    });
    return null;
  }
}

// ===========================================
// Export Types
// ===========================================

export type { ValidCategory, ValidType, ValidPriority };
