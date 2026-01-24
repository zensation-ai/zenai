import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { StructuredIdea, normalizeCategory, normalizeType, normalizePriority } from '../utils/ollama';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

let openaiClient: OpenAI | null = null;

if (OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
  logger.info('OpenAI client initialized', { model: OPENAI_MODEL });
}

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

/**
 * Check if OpenAI is available
 */
export function isOpenAIAvailable(): boolean {
  return openaiClient !== null && OPENAI_API_KEY !== undefined;
}

/**
 * Structure transcript using OpenAI
 */
export async function structureWithOpenAI(transcript: string): Promise<StructuredIdea> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(responseText);

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
  } catch (error: unknown) {
    logger.error('OpenAI structuring error', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Generate text embedding using OpenAI text-embedding-3-small model
 * This is the primary embedding method for production (Railway/Vercel)
 * Returns 768-dimensional vector to match database schema
 */
export async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    const response = await openaiClient.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
      dimensions: 768, // Match database vector(768) columns
    });

    return response.data[0].embedding;
  } catch (error: unknown) {
    logger.error('OpenAI embedding generation error', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Generic OpenAI call that returns parsed JSON
 */
export async function queryOpenAIJSON<T = unknown>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(responseText) as T;
  } catch (error: unknown) {
    logger.error('OpenAI JSON query error', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Transcribe audio using OpenAI Whisper API
 * This is used in production (Railway) where local Whisper CLI is not available
 */
export async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  filename: string = 'audio.webm'
): Promise<{ text: string; language: string; duration: number }> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized - OPENAI_API_KEY required for transcription');
  }

  const startTime = Date.now();

  try {
    // Create a File object from the buffer
    const file = new File([audioBuffer], filename, {
      type: filename.endsWith('.webm') ? 'audio/webm' :
            filename.endsWith('.mp3') ? 'audio/mpeg' :
            filename.endsWith('.m4a') ? 'audio/mp4' :
            filename.endsWith('.wav') ? 'audio/wav' : 'audio/webm'
    });

    const response = await openaiClient.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'de', // Force German
      response_format: 'json',
    });

    const duration = Date.now() - startTime;
    logger.info('OpenAI Whisper transcription completed', {
      duration,
      textLength: response.text.length,
      operation: 'transcribeWithOpenAI',
    });

    return {
      text: response.text,
      language: 'de',
      duration,
    };
  } catch (error: unknown) {
    logger.error('OpenAI Whisper transcription error', error instanceof Error ? error : undefined, {
      operation: 'transcribeWithOpenAI',
    });
    throw error;
  }
}

/**
 * Generate text response using OpenAI
 */
export async function generateOpenAIResponse(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    return responseText.trim();
  } catch (error: unknown) {
    logger.error('OpenAI text generation error', error instanceof Error ? error : undefined);
    throw error;
  }
}
