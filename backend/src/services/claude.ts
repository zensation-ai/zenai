import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { StructuredIdea, normalizeCategory, normalizeType, normalizePriority } from '../utils/ollama';
import { AIContext } from '../utils/database-context';
import { buildSystemPrompt, trackContextUsage, getUnifiedContext } from './business-context';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

let claudeClient: Anthropic | null = null;

if (ANTHROPIC_API_KEY) {
  claudeClient = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });
  logger.info('Claude client initialized', { model: CLAUDE_MODEL });
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
 * Check if Claude is available
 */
export function isClaudeAvailable(): boolean {
  return claudeClient !== null && ANTHROPIC_API_KEY !== undefined;
}

/**
 * Structure transcript using Claude
 */
export async function structureWithClaude(transcript: string): Promise<StructuredIdea> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  try {
    const message = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
      ],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    if (!responseText) {
      throw new Error('No response from Claude');
    }

    // Extract JSON from response (Claude might wrap it in markdown)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

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
    logger.error('Claude structuring error', error);
    throw error;
  }
}

/**
 * Structure transcript using Claude with personalized context
 * Uses business profile and learning data for better results
 */
export async function structureWithClaudePersonalized(
  transcript: string,
  context: AIContext
): Promise<StructuredIdea> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  try {
    // Get unified context for personalization
    const unifiedContext = await getUnifiedContext(context);

    // Build personalized system prompt
    let personalizedPrompt = SYSTEM_PROMPT;

    // Add user context if available
    if (unifiedContext.contextDepthScore > 20) {
      const contextParts: string[] = [];

      if (unifiedContext.profile?.role) {
        contextParts.push(`Der Nutzer ist ${unifiedContext.profile.role}.`);
      }
      if (unifiedContext.profile?.industry) {
        contextParts.push(`Branche: ${unifiedContext.profile.industry}.`);
      }
      if (unifiedContext.profile?.tech_stack && unifiedContext.profile.tech_stack.length > 0) {
        contextParts.push(`Tech-Stack: ${unifiedContext.profile.tech_stack.slice(0, 5).join(', ')}.`);
      }
      if (unifiedContext.recentTopics.length > 0) {
        contextParts.push(`Aktuelle Themen: ${unifiedContext.recentTopics.slice(0, 5).join(', ')}.`);
      }

      if (contextParts.length > 0) {
        personalizedPrompt += `\n\n[NUTZER-KONTEXT]\n${contextParts.join('\n')}\n\nBerücksichtige diesen Kontext bei der Kategorisierung und Priorisierung.`;
      }
    }

    logger.info('Structuring with Claude (personalized)', {
      contextDepth: unifiedContext.contextDepthScore,
      hasProfile: !!unifiedContext.profile,
    });

    const message = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: personalizedPrompt,
      messages: [
        { role: 'user', content: `USER MEMO:\n${transcript}\n\nSTRUCTURED OUTPUT:` }
      ],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    if (!responseText) {
      throw new Error('No response from Claude');
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const result: StructuredIdea = {
      title: parsed.title || 'Unstrukturierte Notiz',
      type: normalizeType(parsed.type),
      category: normalizeCategory(parsed.category),
      priority: normalizePriority(parsed.priority),
      summary: parsed.summary || '',
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
      context_needed: Array.isArray(parsed.context_needed) ? parsed.context_needed : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };

    // Track that we used context (async, don't await)
    trackContextUsage(context, 'new', unifiedContext).catch(() => {});

    return result;
  } catch (error: any) {
    logger.error('Claude personalized structuring error', error);
    throw error;
  }
}

/**
 * Generic Claude call that returns parsed JSON
 */
export async function queryClaudeJSON<T = unknown>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  try {
    const message = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    if (!responseText) {
      throw new Error('No response from Claude');
    }

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Claude response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  } catch (error: any) {
    logger.error('Claude JSON query error', error);
    throw error;
  }
}

/**
 * Generate text response using Claude
 */
export async function generateClaudeResponse(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!claudeClient) {
    throw new Error('Claude client not initialized');
  }

  try {
    const message = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    });

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    if (!responseText) {
      throw new Error('No response from Claude');
    }

    return responseText.trim();
  } catch (error: any) {
    logger.error('Claude text generation error', error);
    throw error;
  }
}
