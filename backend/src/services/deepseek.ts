/**
 * DeepSeek AI Service
 *
 * Cloud provider for DeepSeek models via OpenAI-compatible API.
 * Provides cost-effective reasoning and general-purpose text generation.
 *
 * Models:
 * - deepseek-chat: Balanced (standard queries)
 * - deepseek-reasoner: Premium (complex reasoning)
 *
 * @module services/deepseek
 */

import { logger } from '../utils/logger';
import { checkedFetch } from '../utils/checked-http';

// ===========================================
// Configuration
// ===========================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// ===========================================
// Availability
// ===========================================

export function isDeepSeekAvailable(): boolean {
  return !!DEEPSEEK_API_KEY;
}

// ===========================================
// Text Generation
// ===========================================

/**
 * Generate text response using DeepSeek's OpenAI-compatible API
 */
export async function deepseekGenerate(prompt: string, options?: {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const model = options?.model || DEFAULT_MODEL;

  const messages: Array<{ role: string; content: string }> = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await checkedFetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('DeepSeek API error', undefined, { status: response.status, error });
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Empty DeepSeek response');
  }

  return text;
}

// ===========================================
// Structured Idea Generation
// ===========================================

/**
 * Structure transcript using DeepSeek (same interface as Gemini/Mistral)
 */
export async function deepseekStructure(
  transcript: string,
  systemPrompt: string
): Promise<{ title: string; summary: string; tags: string[] }> {
  const prompt = `${systemPrompt}\n\nText:\n${transcript}\n\nRespond with JSON: {"title": "...", "summary": "...", "tags": ["..."]}`;

  const result = await deepseekGenerate(prompt, { temperature: 0.3 });

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
