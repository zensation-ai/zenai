import axios from 'axios';
import { getCachedEmbedding, cache } from './cache';
import { logger } from './logger';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'mistral';

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

// Valid categories and types for database constraints
const VALID_CATEGORIES = ['business', 'technical', 'personal', 'learning'] as const;
const VALID_TYPES = ['idea', 'task', 'insight', 'problem', 'question'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

// Category mapping for common LLM outputs that don't match our schema
const CATEGORY_MAPPING: Record<string, typeof VALID_CATEGORIES[number]> = {
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

/**
 * Normalize category to valid database value
 */
export function normalizeCategory(category: string | undefined): typeof VALID_CATEGORIES[number] {
  if (!category) return 'personal';

  // Handle pipe-separated categories (e.g., "EwS|Strategie|Business")
  // Take the first part or find the first matching category
  const parts = category.split('|').map(p => p.toLowerCase().trim());

  for (const part of parts) {
    // Direct match
    if (VALID_CATEGORIES.includes(part as typeof VALID_CATEGORIES[number])) {
      return part as typeof VALID_CATEGORIES[number];
    }

    // Check mapping
    if (CATEGORY_MAPPING[part]) {
      return CATEGORY_MAPPING[part];
    }
  }

  // Default fallback
  return 'business';
}

/**
 * Normalize type to valid database value
 */
export function normalizeType(type: string | undefined): typeof VALID_TYPES[number] {
  if (!type) return 'idea';

  const lower = type.toLowerCase().trim();

  if (VALID_TYPES.includes(lower as typeof VALID_TYPES[number])) {
    return lower as typeof VALID_TYPES[number];
  }

  return 'idea';
}

/**
 * Normalize priority to valid database value
 */
export function normalizePriority(priority: string | undefined): typeof VALID_PRIORITIES[number] {
  if (!priority) return 'medium';

  const lower = priority.toLowerCase().trim();

  if (VALID_PRIORITIES.includes(lower as typeof VALID_PRIORITIES[number])) {
    return lower as typeof VALID_PRIORITIES[number];
  }

  return 'medium';
}

export async function structureWithOllama(transcript: string): Promise<StructuredIdea> {
  const prompt = `${SYSTEM_PROMPT}

USER MEMO:
${transcript}

STRUCTURED OUTPUT:`;

  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 500,
          temperature: 0.3,
          top_p: 0.9,
        },
      },
      { timeout: 60000 }
    );

    const responseText = response.data.response.trim();

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    // Normalize fields to ensure they match database constraints
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
  } catch (error: any) {
    console.error('Ollama structuring error:', error.message);

    // Return a fallback structure
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
}

/**
 * Generate embedding with Redis caching
 * Phase 11: Embeddings are cached for 7 days to avoid recomputation
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use cached version if available
  return getCachedEmbedding(text, generateEmbeddingUncached);
}

/**
 * Generate embedding without caching (internal use)
 */
async function generateEmbeddingUncached(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/embeddings`,
      {
        model: 'nomic-embed-text',
        prompt: text,
      },
      { timeout: 30000 }
    );

    return response.data.embedding;
  } catch (error: any) {
    logger.error('Embedding generation error', error, { operation: 'generateEmbedding' });
    // Return empty embedding on error
    return [];
  }
}

export async function checkOllamaHealth(): Promise<{ available: boolean; models: string[] }> {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const models = response.data.models?.map((m: any) => m.name) || [];
    return { available: true, models };
  } catch (error) {
    return { available: false, models: [] };
  }
}

/**
 * Generic LLM call that returns parsed JSON
 * Use this for custom prompts that don't follow the StructuredIdea format
 */
export async function queryOllamaJSON<T = unknown>(prompt: string): Promise<T | null> {
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 1000,
          temperature: 0.3,
          top_p: 0.9,
        },
      },
      { timeout: 60000 }
    );

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
  } catch (error: any) {
    console.error('Ollama JSON query error:', error.message);
    return null;
  }
}
