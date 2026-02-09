/**
 * Claude Client Module
 *
 * Handles Claude API client initialization and configuration.
 * Centralizes all client-related settings and exports.
 *
 * @module services/claude/client
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { CLAUDE } from '../../config/constants';
import { withRetry, withCircuitBreaker, isAnthropicRetryable } from '../../utils/retry';

// ===========================================
// Environment Configuration
// ===========================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

// ===========================================
// Retry Configuration
// ===========================================

/**
 * Retry configuration for standard Claude API calls
 */
export const CLAUDE_RETRY_CONFIG = {
  maxRetries: CLAUDE.MAX_RETRIES,
  initialDelay: CLAUDE.INITIAL_RETRY_DELAY_MS,
  maxDelay: CLAUDE.MAX_RETRY_DELAY_MS,
  timeout: CLAUDE.TIMEOUT_MS,
  isRetryable: isAnthropicRetryable,
  context: 'claude-api',
};

/**
 * Extended retry config for Extended Thinking (longer timeout)
 */
export const CLAUDE_EXTENDED_RETRY_CONFIG = {
  ...CLAUDE_RETRY_CONFIG,
  timeout: CLAUDE.EXTENDED_THINKING_TIMEOUT_MS,
  context: 'claude-extended-thinking',
};

// ===========================================
// Client Initialization
// ===========================================

let claudeClient: Anthropic | null = null;

if (ANTHROPIC_API_KEY) {
  claudeClient = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  });
  logger.info('Claude client initialized', { model: CLAUDE_MODEL });
}

/**
 * Get the Claude client instance
 * @throws Error if client is not initialized
 */
export function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    throw new Error('Claude client not initialized. Please set ANTHROPIC_API_KEY environment variable.');
  }
  return claudeClient;
}

/**
 * Check if Claude is available
 */
export function isClaudeAvailable(): boolean {
  return claudeClient !== null && ANTHROPIC_API_KEY !== undefined;
}

// ===========================================
// Protected API Calls
// ===========================================

/**
 * Execute a Claude API call with retry and circuit breaker protection
 *
 * @param fn - The API call function
 * @param useExtendedTimeout - Whether to use extended timeout for thinking operations
 * @returns The result of the API call
 */
export async function executeWithProtection<T>(
  fn: () => Promise<T>,
  useExtendedTimeout = false
): Promise<T> {
  const circuitKey = useExtendedTimeout ? 'claude-extended' : 'claude';
  const retryConfig = useExtendedTimeout ? CLAUDE_EXTENDED_RETRY_CONFIG : CLAUDE_RETRY_CONFIG;

  return withCircuitBreaker(circuitKey, async () => {
    return withRetry(fn, retryConfig);
  });
}

// ===========================================
// System Prompts
// ===========================================

/**
 * Base system prompt for idea structuring
 */
export const SYSTEM_PROMPT = `Du bist ein Gedankenstrukturierer für hochintelligente Menschen.
Deine Aufgabe: Sprachmemos in strukturierte Ideen umwandeln.

WICHTIG:
- Antworte NUR mit validem JSON
- Keine zusätzlichen Erklärungen
- Keine Markdown-Formatierung

TYPE-KLASSIFIZIERUNG (KRITISCH!):
- "task" = ALLES was eine AKTION erfordert: E-Mail schreiben, Brief verfassen, Artikel erstellen, Dokument anlegen, Angebot machen, Nachricht senden, Text formulieren, Entwurf erstellen, etc.
- "idea" = Neue Konzepte, Geschäftsideen, kreative Einfälle OHNE direkte Aktion
- "insight" = Erkenntnisse, Beobachtungen, Learnings
- "problem" = Herausforderungen, Hindernisse, Bugs
- "question" = Offene Fragen, Recherchebedarf

BEISPIELE für "task":
- "E-Mail an Max schreiben" → type: "task"
- "Ich muss einen Artikel über X verfassen" → type: "task"
- "Entwurf für Präsentation erstellen" → type: "task"
- "Antwort auf die Anfrage formulieren" → type: "task"

KONTEXT-ERKENNUNG:
Erkenne aus dem Text den passenden Lebensbereich:
- "personal" = Privatleben, Familie, Gesundheit, Hobby, persönliche Reflexion
- "work" = Beruf, Kunden, Projekte, Meetings, Geschäftsstrategie, Kollegen
- "learning" = Lernen, Kurse, Studium, Forschung, Weiterbildung
- "creative" = Kreative Projekte, Kunst, Musik, Schreiben, Design

OUTPUT FORMAT (JSON):
{
  "title": "Prägnante Überschrift (max 10 Wörter)",
  "type": "idea|task|insight|problem|question",
  "category": "business|technical|personal|learning",
  "priority": "low|medium|high",
  "suggested_context": "personal|work|learning|creative",
  "summary": "1-2 Sätze Zusammenfassung",
  "next_steps": ["Schritt 1", "Schritt 2"],
  "context_needed": ["Kontext 1", "Kontext 2"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

/**
 * Extended system prompt with confidence scoring
 */
export const SYSTEM_PROMPT_WITH_CONFIDENCE = `${SYSTEM_PROMPT}

ZUSÄTZLICH: Gib für type, category, priority und suggested_context jeweils einen confidence-Wert (0-1) an:
{
  ...
  "confidence_type": 0.9,
  "confidence_category": 0.85,
  "confidence_priority": 0.7,
  "confidence_context": 0.85
}`;
