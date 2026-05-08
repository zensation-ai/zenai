/**
 * Google Gemini AI Service
 *
 * Cloud provider for Google Gemini models. Mirrors the Mistral service pattern.
 * Falls between Claude and Ollama in the provider chain.
 *
 * Models:
 * - gemini-2.5-flash: Fast, cheap (simple queries)
 * - gemini-2.5-pro: High quality (complex synthesis)
 *
 * @module services/gemini
 */

import { logger } from '../utils/logger';
import { checkedFetch } from '../utils/checked-http';

// ===========================================
// Configuration
// ===========================================

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ===========================================
// Availability
// ===========================================

export function isGeminiAvailable(): boolean {
  return !!GEMINI_API_KEY;
}

// ===========================================
// Text Generation
// ===========================================

/**
 * Generate text response using Gemini API
 */
export async function geminiGenerate(prompt: string, options?: {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not configured');
  }

  const model = options?.model || DEFAULT_MODEL;
  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (options?.systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: options.systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const response = await checkedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('Gemini API error', undefined, { status: response.status, error });
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty Gemini response');
  }

  return text;
}

// ===========================================
// Embeddings
// ===========================================

/**
 * Generate embedding using Gemini text-embedding-004 model
 * Returns 768-dimensional vector to match DB schema (vector(768))
 */
export async function geminiEmbed(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not configured');
  }

  const url = `${GEMINI_BASE_URL}/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

  const response = await checkedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: 768, // Match ZenAI's 768-dim standard
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini embedding error: ${response.status}`);
  }

  const data = await response.json() as {
    embedding?: { values?: number[] };
  };
  const embedding = data.embedding?.values;
  if (!embedding) {
    throw new Error('Empty Gemini embedding');
  }

  // Truncate to 768 dimensions if needed
  return embedding.slice(0, 768);
}

// ===========================================
// Structured Idea Generation
// ===========================================

/**
 * Structure transcript using Gemini (same interface as Mistral/Claude)
 */
export async function geminiStructure(
  transcript: string,
  systemPrompt: string
): Promise<{ title: string; summary: string; tags: string[] }> {
  const prompt = `${systemPrompt}\n\nText:\n${transcript}\n\nRespond with JSON: {"title": "...", "summary": "...", "tags": ["..."]}`;

  const result = await geminiGenerate(prompt, { temperature: 0.3 });

  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      title: transcript.slice(0, 50),
      summary: transcript.slice(0, 200),
      tags: [],
    };
  }
}
