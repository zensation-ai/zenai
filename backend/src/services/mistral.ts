/**
 * Mistral AI Service
 *
 * Cloud provider for Mistral AI models. Mirrors the OpenAI service pattern.
 * Falls between Claude (primary) and Ollama (local fallback) in the provider chain.
 *
 * Models:
 * - mistral-small-latest: Fast, cheap (simple queries)
 * - mistral-medium-latest: Balanced (standard queries)
 * - mistral-large-latest: High quality (complex synthesis)
 *
 * @module services/mistral
 */

import { Mistral } from '@mistralai/mistralai';
import { logger } from '../utils/logger';
import { StructuredIdea, normalizeCategory, normalizeType, normalizePriority } from '../utils/ollama';

// ===========================================
// Configuration
// ===========================================

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';
const MISTRAL_EMBEDDING_MODEL = 'mistral-embed';

let mistralClient: Mistral | null = null;

if (MISTRAL_API_KEY) {
  mistralClient = new Mistral({ apiKey: MISTRAL_API_KEY });
  logger.info('Mistral client initialized', { model: MISTRAL_MODEL });
}

// ===========================================
// Availability
// ===========================================

export function isMistralAvailable(): boolean {
  return mistralClient !== null && MISTRAL_API_KEY !== undefined;
}

export function getMistralClient(): Mistral {
  if (!mistralClient) {
    throw new Error('Mistral client not initialized. Set MISTRAL_API_KEY.');
  }
  return mistralClient;
}

// ===========================================
// System Prompt (same as OpenAI for consistency)
// ===========================================

const SYSTEM_PROMPT = `Du bist ein Gedankenstrukturierer für hochintelligente Menschen.
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
// Text Generation
// ===========================================

export interface MistralGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * Generate text response using Mistral API
 */
export async function generateMistralResponse(
  systemPrompt: string,
  userPrompt: string,
  options: MistralGenerationOptions = {},
): Promise<string> {
  if (!mistralClient) {
    throw new Error('Mistral client not initialized');
  }

  const { temperature = 0.7, maxTokens = 500, jsonMode = false } = options;

  try {
    const response = await mistralClient.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      maxTokens,
      ...(jsonMode ? { responseFormat: { type: 'json_object' as const } } : {}),
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('No response from Mistral');
    }

    return content.trim();
  } catch (error: unknown) {
    logger.error('Mistral text generation error', error instanceof Error ? error : undefined);
    throw error;
  }
}

// ===========================================
// Structured Idea Generation
// ===========================================

/**
 * Structure transcript using Mistral (same interface as OpenAI/Claude)
 */
export async function structureWithMistral(transcript: string): Promise<StructuredIdea> {
  if (!mistralClient) {
    throw new Error('Mistral client not initialized');
  }

  try {
    const response = await mistralClient.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` },
      ],
      temperature: 0.3,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
    });

    const responseText = response.choices?.[0]?.message?.content;
    if (!responseText || typeof responseText !== 'string') {
      throw new Error('No response from Mistral');
    }

    const parsed = JSON.parse(responseText);

    return {
      title: parsed.title || 'Unstrukturierte Notiz',
      type: normalizeType(parsed.type),
      category: normalizeCategory(parsed.category),
      priority: normalizePriority(parsed.priority),
      summary: parsed.summary || '',
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
      context_needed: Array.isArray(parsed.context_needed) ? parsed.context_needed : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  } catch (error: unknown) {
    logger.error('Mistral structuring error', error instanceof Error ? error : undefined);
    throw error;
  }
}

// ===========================================
// Embeddings
// ===========================================

/**
 * Generate embedding using Mistral mistral-embed model
 * Returns 1024-dimensional vector (Mistral default)
 * Note: Mistral embeddings are 1024-dim, we truncate to 768 for DB compatibility
 */
export async function generateMistralEmbedding(text: string): Promise<number[]> {
  if (!mistralClient) {
    throw new Error('Mistral client not initialized');
  }

  try {
    const response = await mistralClient.embeddings.create({
      model: MISTRAL_EMBEDDING_MODEL,
      inputs: [text],
    });

    const embedding = response.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('No embedding from Mistral');
    }

    // Truncate to 768 dimensions to match DB schema (vector(768))
    if (embedding.length > 768) {
      return embedding.slice(0, 768);
    }

    return embedding;
  } catch (error: unknown) {
    logger.error('Mistral embedding generation error', error instanceof Error ? error : undefined);
    throw error;
  }
}

// ===========================================
// Generic JSON Query
// ===========================================

/**
 * Generic Mistral call that returns parsed JSON
 */
export async function queryMistralJSON<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  if (!mistralClient) {
    throw new Error('Mistral client not initialized');
  }

  try {
    const response = await mistralClient.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 1000,
      responseFormat: { type: 'json_object' },
    });

    const responseText = response.choices?.[0]?.message?.content;
    if (!responseText || typeof responseText !== 'string') {
      throw new Error('No response from Mistral');
    }

    return JSON.parse(responseText) as T;
  } catch (error: unknown) {
    logger.error('Mistral JSON query error', error instanceof Error ? error : undefined);
    throw error;
  }
}
