/**
 * Page Analyzer Service - Phase 2
 *
 * AI-powered analysis of web page content.
 * Generates summaries, extracts keywords, and categorizes pages.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export interface PageAnalysis {
  summary: string;
  keywords: string[];
  category: string;
  language: string;
  key_points: string[];
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  domain: string;
}

// ============================================================
// Analysis
// ============================================================

let anthropic: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

/**
 * Analyze page content using Claude API
 */
export async function analyzePage(content: PageContent): Promise<PageAnalysis | null> {
  const client = getClient();
  if (!client) {
    logger.warn('Page analyzer: ANTHROPIC_API_KEY not set, skipping analysis');
    return null;
  }

  // Truncate text to avoid excessive token usage
  const maxChars = 8000;
  const truncatedText = content.text.length > maxChars
    ? content.text.slice(0, maxChars) + '...[truncated]'
    : content.text;

  try {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analysiere diese Webseite und antworte NUR als JSON (keine Markdown-Formatierung):

URL: ${content.url}
Titel: ${content.title}
Domain: ${content.domain}

Inhalt:
${truncatedText}

Antworte als JSON mit diesen Feldern:
{
  "summary": "2-3 Saetze Zusammenfassung auf Deutsch",
  "keywords": ["max 5 relevante Stichwoerter"],
  "category": "eine Kategorie: technology|business|news|science|education|entertainment|health|finance|shopping|social|reference|other",
  "language": "de oder en oder andere ISO-639-1 Codes",
  "key_points": ["max 3 wichtigste Punkte"]
}`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response - handle potential markdown wrapping
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Page analyzer: Could not parse JSON from response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      category: parsed.category || 'other',
      language: parsed.language || 'de',
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
    };
  } catch (err) {
    logger.error('Page analyzer: Analysis failed', err instanceof Error ? err : new Error(String(err)), { url: content.url });
    return null;
  }
}

/**
 * Generate a quick summary without full analysis (cheaper, faster)
 */
export async function quickSummarize(text: string, maxLength = 200): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const truncated = text.length > 4000 ? text.slice(0, 4000) + '...' : text;

  try {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Fasse diesen Text in max ${maxLength} Zeichen zusammen (Deutsch):\n\n${truncated}`,
      }],
    });

    const result = response.content[0].type === 'text' ? response.content[0].text : '';
    return result.slice(0, maxLength);
  } catch (err) {
    logger.error('Page analyzer: Quick summarize failed', err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}
