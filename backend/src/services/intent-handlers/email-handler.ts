/**
 * Email Draft Intent Handler - Phase 35
 *
 * Generates professional email drafts from voice memo intents.
 * Stores drafts for later copy/editing, no actual email sending.
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext } from '../../utils/database-context';
import { queryContext } from '../../utils/database-context';
import { queryOllamaJSON } from '../../utils/ollama';
import { logger } from '../../utils/logger';
import type { DetectedIntent } from '../intent-detector';
import type { IntentHandlerResult } from './index';

// ============================================================
// Types
// ============================================================

interface EmailDraft {
  subject: string;
  body: string;
  recipient?: string;
  tone: 'formal' | 'informal' | 'friendly';
}

// ============================================================
// Email Generation Prompt
// ============================================================

const EMAIL_DRAFT_PROMPT = `Du bist ein professioneller E-Mail-Assistent. Erstelle einen E-Mail-Entwurf basierend auf dem Kontext.

REGELN:
- Schreibe die E-Mail auf Deutsch (es sei denn, der Kontext ist eindeutig englisch)
- Verwende einen angemessenen Ton (formal bei geschaeftlichen, freundlich bei persoenlichen)
- Beginne mit einer passenden Anrede
- Schliesse mit einem passenden Gruss
- Halte die E-Mail praegnant und klar
- Wenn kein Empfaenger genannt wird, verwende "[Empfaenger]"

Antworte NUR mit validem JSON:
{
  "subject": "Betreffzeile",
  "body": "Vollstaendiger E-Mail-Text mit Anrede und Gruss",
  "recipient": "Name oder E-Mail des Empfaengers (falls bekannt, sonst null)",
  "tone": "formal|informal|friendly"
}`;

// ============================================================
// Handler
// ============================================================

/**
 * Handle an email_draft intent
 */
export async function handleEmailIntent(
  context: AIContext,
  intent: DetectedIntent,
  originalText: string
): Promise<IntentHandlerResult> {
  const data = intent.extracted_data;

  // Build prompt for email generation
  const contextParts: string[] = [];

  if (data.recipient) {contextParts.push(`Empfaenger: ${data.recipient}`);}
  if (data.subject) {contextParts.push(`Betreff-Kontext: ${data.subject}`);}
  if (data.key_points && Array.isArray(data.key_points)) {
    contextParts.push(`Kernpunkte: ${(data.key_points as string[]).join(', ')}`);
  }
  if (data.tone) {contextParts.push(`Ton: ${data.tone}`);}

  const prompt = `${EMAIL_DRAFT_PROMPT}

KONTEXT:
${contextParts.length > 0 ? contextParts.join('\n') : 'Keine zusaetzlichen Details'}

ORIGINAL-TEXT (Sprachnotiz):
"${originalText}"`;

  try {
    // Generate email draft via LLM
    const draft = await queryOllamaJSON<EmailDraft>(prompt);

    if (!draft || !draft.body) {
      return {
        success: false,
        intent_type: 'email_draft',
        error: 'E-Mail-Entwurf konnte nicht generiert werden',
      };
    }

    // Store the draft in the database
    const draftId = uuidv4();
    const now = new Date().toISOString();

    try {
      await queryContext(context, `
        INSERT INTO drafts (id, idea_id, content, draft_type, status, metadata, created_at, updated_at)
        VALUES ($1, NULL, $2, 'email', 'generated', $3, $4, $4)
      `, [
        draftId,
        draft.body,
        JSON.stringify({
          subject: draft.subject || 'Kein Betreff',
          recipient: draft.recipient || null,
          tone: draft.tone || 'formal',
          source: 'voice-memo',
          original_text: originalText,
        }),
        now,
      ]);
    } catch (dbErr) {
      // Draft table might not have 'email' draft_type - store anyway
      logger.warn('Could not store email draft in DB, returning in response', {
        error: (dbErr as Error).message,
        operation: 'handleEmailIntent'
      });
    }

    const subject = draft.subject || 'Kein Betreff';
    const recipient = draft.recipient || '[Empfaenger]';

    return {
      success: true,
      intent_type: 'email_draft',
      created_resource: {
        type: 'email_draft',
        id: draftId,
        summary: `E-Mail an ${recipient}: ${subject}`,
        data: {
          subject,
          body: draft.body,
          recipient: draft.recipient || null,
          tone: draft.tone || 'formal',
        },
      },
    };
  } catch (err) {
    logger.error('Failed to generate email draft', err instanceof Error ? err : undefined, {
      operation: 'handleEmailIntent'
    });
    return {
      success: false,
      intent_type: 'email_draft',
      error: (err as Error).message,
    };
  }
}
