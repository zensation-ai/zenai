/**
 * Email AI Service - Phase 38
 *
 * AI-powered email analysis: summarization, categorization,
 * priority detection, sentiment analysis, and reply suggestions.
 */

import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './claude/client';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { episodicMemory } from './memory/episodic-memory';
import { sendNotification } from './push-notifications';

// ============================================================
// Types
// ============================================================

interface AIEmailAnalysis {
  summary: string;
  category: string;
  priority: string;
  sentiment: string;
  action_items: Array<{ text: string }>;
}

export interface ReplySuggestion {
  tone: string;
  subject: string;
  body: string;
}

// ============================================================
// Process Email with AI
// ============================================================

export async function processEmailWithAI(context: AIContext, emailId: string): Promise<void> {
  const result = await queryContext(context, `
    SELECT id, subject, body_text, body_html, from_address, from_name, to_addresses
    FROM emails WHERE id = $1
  `, [emailId]);

  if (result.rows.length === 0) {
    logger.warn('Email not found for AI processing', { emailId, operation: 'processEmailWithAI' });
    return;
  }

  const email = result.rows[0];
  const content = email.body_text || stripHtml(email.body_html || '') || '';

  if (content.length < 10) {
    logger.info('Email too short for AI processing', { emailId, operation: 'processEmailWithAI' });
    return;
  }

  // Truncate very long emails
  const truncated = content.length > 3000 ? content.substring(0, 3000) + '...' : content;

  try {
    const client = getClaudeClient();

    const response = await executeWithProtection(() =>
      client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: `Du bist ein E-Mail-Analyse-Assistent. Analysiere die E-Mail und antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklaerung):

{
  "summary": "Kurze Zusammenfassung in 1-2 Saetzen auf Deutsch",
  "category": "business|personal|newsletter|notification|spam",
  "priority": "low|medium|high|urgent",
  "sentiment": "positive|neutral|negative",
  "action_items": [{"text": "Beschreibung der Aufgabe"}]
}

Regeln:
- summary: Max 2 Saetze, auf Deutsch
- category: Waehle die passendste Kategorie
- priority: urgent nur bei zeitkritischen Anfragen
- action_items: Nur wenn konkrete Aufgaben erkennbar sind, sonst leeres Array`,
        messages: [{
          role: 'user',
          content: `<email>\nVon: ${sanitizeForAI(email.from_name || email.from_address)}\nBetreff: ${sanitizeForAI(email.subject || '(Kein Betreff)')}\n\n${sanitizeForAI(truncated)}\n</email>`,
        }],
      })
    );

    // Parse response
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      logger.warn('No text in AI response', { emailId, operation: 'processEmailWithAI' });
      return;
    }

    let analysis: AIEmailAnalysis;
    try {
      // Extract JSON from potential markdown wrapping
      const jsonStr = textBlock.text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = JSON.parse(jsonStr);
    } catch {
      logger.warn('Failed to parse AI email analysis', { emailId, text: textBlock.text.substring(0, 200), operation: 'processEmailWithAI' });
      // Mark as processed with error to prevent infinite retries
      await queryContext(context, `
        UPDATE emails SET
          ai_processed_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) || '{"ai_parse_error": true}'::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `, [emailId]);
      return;
    }

    // Validate AI analysis fields against allowed values
    const VALID_CATEGORIES = ['business', 'personal', 'newsletter', 'notification', 'spam'];
    const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    const VALID_SENTIMENTS = ['positive', 'neutral', 'negative'];

    const safeCategory = VALID_CATEGORIES.includes(analysis.category) ? analysis.category : null;
    const safePriority = VALID_PRIORITIES.includes(analysis.priority) ? analysis.priority : null;
    const safeSentiment = VALID_SENTIMENTS.includes(analysis.sentiment) ? analysis.sentiment : null;

    // Update email with AI analysis
    await queryContext(context, `
      UPDATE emails SET
        ai_summary = $2,
        ai_category = $3,
        ai_priority = $4,
        ai_sentiment = $5,
        ai_action_items = $6,
        ai_processed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [
      emailId,
      analysis.summary ? analysis.summary.substring(0, 500) : null,
      safeCategory,
      safePriority,
      safeSentiment,
      JSON.stringify((analysis.action_items || []).slice(0, 10)),
    ]);

    // Store in episodic memory so chat can reference email context
    try {
      await episodicMemory.store(
        `Email von ${email.from_name || email.from_address}: ${email.subject || '(Kein Betreff)'}`,
        analysis.summary || '',
        `email-${emailId}`,
        context
      );
    } catch (memErr) {
      logger.warn('Failed to store email in episodic memory', {
        emailId, error: memErr instanceof Error ? memErr.message : String(memErr),
        operation: 'processEmailWithAI',
      });
    }

    // Notify on high/urgent priority emails
    if (analysis.priority === 'high' || analysis.priority === 'urgent') {
      try {
        await sendNotification(context, {
          type: 'custom',
          title: `${analysis.priority === 'urgent' ? 'Dringend' : 'Wichtig'}: ${email.subject || 'Neue E-Mail'}`,
          body: analysis.summary || `E-Mail von ${email.from_name || email.from_address}`,
          data: { emailId, category: analysis.category, priority: analysis.priority },
        });
      } catch (notifErr) {
        logger.warn('Failed to send email notification', {
          emailId, error: notifErr instanceof Error ? notifErr.message : String(notifErr),
          operation: 'processEmailWithAI',
        });
      }
    }

    logger.info('Email AI analysis complete', {
      emailId,
      category: analysis.category,
      priority: analysis.priority,
      actionItems: (analysis.action_items || []).length,
      operation: 'processEmailWithAI',
    });
  } catch (err) {
    logger.error('Email AI processing failed', err instanceof Error ? err : undefined, {
      emailId,
      operation: 'processEmailWithAI',
    });
  }
}

// ============================================================
// Generate Reply Suggestions
// ============================================================

export async function generateReplySuggestions(context: AIContext, emailId: string): Promise<ReplySuggestion[]> {
  const result = await queryContext(context, `
    SELECT id, subject, body_text, body_html, from_address, from_name
    FROM emails WHERE id = $1
  `, [emailId]);

  if (result.rows.length === 0) {return [];}

  const email = result.rows[0];
  const content = email.body_text || stripHtml(email.body_html || '') || '';
  const truncated = content.length > 2000 ? content.substring(0, 2000) + '...' : content;

  const client = getClaudeClient();

  const response = await executeWithProtection(() =>
    client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: `Du bist ein E-Mail-Assistent. Erstelle 3 Antwort-Vorschlaege fuer die E-Mail.
Antworte NUR mit einem JSON-Array (kein Markdown):

[
  {"tone": "formell", "subject": "Re: ...", "body": "Antwort-Text"},
  {"tone": "freundlich", "subject": "Re: ...", "body": "Antwort-Text"},
  {"tone": "kurz", "subject": "Re: ...", "body": "Antwort-Text"}
]

Regeln:
- Alle Antworten auf Deutsch
- "formell": Geschaeftlich, hoeflich, vollstaendig
- "freundlich": Warmherzig, persoenlich, offen
- "kurz": Praegnant, maximal 2-3 Saetze
- Subject immer mit "Re: " Prefix des Originals`,
      messages: [{
        role: 'user',
        content: `<email>\nVon: ${sanitizeForAI(email.from_name || email.from_address)}\nBetreff: ${sanitizeForAI(email.subject || '(Kein Betreff)')}\n\n${sanitizeForAI(truncated)}\n</email>`,
      }],
    })
  );

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {return [];}

  try {
    const jsonStr = textBlock.text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    const suggestions: ReplySuggestion[] = JSON.parse(jsonStr);

    // Cache in DB
    await queryContext(context, `
      UPDATE emails SET ai_reply_suggestions = $2, updated_at = NOW()
      WHERE id = $1
    `, [emailId, JSON.stringify(suggestions)]);

    return suggestions;
  } catch {
    logger.warn('Failed to parse reply suggestions', { emailId, operation: 'generateReplySuggestions' });
    return [];
  }
}

// ============================================================
// Summarize Thread
// ============================================================

export async function summarizeThread(context: AIContext, threadId: string): Promise<string> {
  const result = await queryContext(context, `
    SELECT from_address, from_name, subject, body_text, body_html, received_at, direction
    FROM emails
    WHERE thread_id = $1
    ORDER BY received_at ASC
  `, [threadId]);

  if (result.rows.length === 0) {return 'Kein Thread gefunden.';}

  // Build conversation text
  const conversation = result.rows.map(row => {
    const content = row.body_text || stripHtml(row.body_html || '') || '';
    const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
    const direction = row.direction === 'inbound' ? 'Empfangen' : 'Gesendet';
    return `[${direction}] Von: ${row.from_name || row.from_address}\n${truncated}`;
  }).join('\n---\n');

  const truncatedConvo = conversation.length > 4000 ? conversation.substring(0, 4000) + '...' : conversation;

  const client = getClaudeClient();

  const response = await executeWithProtection(() =>
    client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: 'Du bist ein E-Mail-Assistent. Fasse den E-Mail-Thread in 2-4 Saetzen auf Deutsch zusammen. Nenne die wichtigsten Punkte, Entscheidungen und offene Fragen.',
      messages: [{
        role: 'user',
        content: `Betreff: ${result.rows[0].subject || '(Kein Betreff)'}\n\n${truncatedConvo}`,
      }],
    })
  );

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {return 'Zusammenfassung nicht verfuegbar.';}

  return textBlock.text;
}

// ============================================================
// AI Smart Compose
// ============================================================

export interface SmartComposeInput {
  prompt: string;
  tone?: 'formell' | 'freundlich' | 'kurz' | 'neutral';
  replyTo?: {
    from: string;
    subject: string;
    body: string;
  };
  context_info?: string;
}

export interface SmartComposeResult {
  subject: string;
  body_text: string;
  body_html: string;
}

export async function smartCompose(input: SmartComposeInput): Promise<SmartComposeResult> {
  const client = getClaudeClient();

  const toneInstructions: Record<string, string> = {
    formell: 'Schreibe geschaeftlich, hoeflich und professionell. Verwende "Sie".',
    freundlich: 'Schreibe warmherzig, persoenlich und offen. Verwende "Du".',
    kurz: 'Schreibe praegnant und auf den Punkt. Maximal 3-5 Saetze.',
    neutral: 'Schreibe sachlich und klar.',
  };

  const tone = input.tone || 'neutral';
  const replyContext = input.replyTo
    ? `\n\nDies ist eine Antwort auf folgende E-Mail:\nVon: ${input.replyTo.from}\nBetreff: ${input.replyTo.subject}\nInhalt: ${input.replyTo.body.substring(0, 1500)}`
    : '';

  const response = await executeWithProtection(() =>
    client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: `Du bist ein E-Mail-Schreib-Assistent. Erstelle eine E-Mail basierend auf den Anweisungen.
${toneInstructions[tone]}

Antworte NUR mit einem JSON-Objekt (kein Markdown):
{
  "subject": "Betreff der E-Mail",
  "body": "Der vollstaendige E-Mail-Text"
}

Regeln:
- Immer auf Deutsch schreiben
- Passende Anrede und Grussformel verwenden
- Subject nur wenn es eine neue E-Mail ist (nicht bei Antworten)
- Bei Antworten: Subject weglassen oder mit "Re: " Prefix`,
      messages: [{
        role: 'user',
        content: `${input.prompt}${replyContext}${input.context_info ? `\n\nZusaetzlicher Kontext: ${input.context_info}` : ''}`,
      }],
    })
  );

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('KI-Antwort konnte nicht verarbeitet werden');
  }

  const jsonStr = textBlock.text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  const bodyText = parsed.body || '';
  const bodyHtml = bodyText
    .split('\n')
    .map((line: string) => {
      if (line.trim() === '') {return '<br>';}
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<p>${escaped}</p>`;
    })
    .join('');

  return {
    subject: parsed.subject || '',
    body_text: bodyText,
    body_html: bodyHtml,
  };
}

// ============================================================
// AI Improve/Rewrite Email
// ============================================================

export async function improveEmailText(text: string, instruction: string): Promise<string> {
  const client = getClaudeClient();

  const response = await executeWithProtection(() =>
    client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: `Du bist ein E-Mail-Editor. Verbessere den Text nach den Anweisungen des Nutzers.
Antworte NUR mit dem verbesserten Text, keine Erklaerungen.
Behalte die Sprache (Deutsch) bei und den allgemeinen Ton.`,
      messages: [{
        role: 'user',
        content: `Anweisung: ${instruction}\n\nOriginal-Text:\n${text}`,
      }],
    })
  );

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('KI-Verbesserung fehlgeschlagen');
  }

  return textBlock.text.trim();
}

// ============================================================
// Helpers
// ============================================================

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize user-provided content before passing to AI prompts.
 * Prevents prompt injection by neutralizing control-like patterns.
 */
function sanitizeForAI(text: string): string {
  return text
    .replace(/```/g, "'''")
    // Neutralize XML/HTML tag injection that could break prompt boundaries
    .replace(/<\/?(?:email|system|user|assistant|instruction|tool)[^>]*>/gi, '')
    // Remove zero-width characters that could hide injected instructions
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
    .substring(0, 5000);
}
