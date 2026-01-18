/**
 * Unified Multimodal Handler
 *
 * Processes multiple input modalities (text, images, audio, documents)
 * in a unified way using Claude's multimodal capabilities.
 *
 * Features:
 * - Unified processing of text, images, and audio
 * - Cross-modal reference resolution
 * - Automatic transcription for audio
 * - Task-specific processing modes
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { transcribeAudio } from './whisper';
import { getUnifiedContext } from './business-context';

// ===========================================
// Types & Interfaces
// ===========================================

export interface ImageInput {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  caption?: string;
}

export interface AudioInput {
  base64: string;
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/m4a' | 'audio/webm';
  durationMs?: number;
}

export interface DocumentInput {
  content: string;
  type: 'pdf' | 'doc' | 'text' | 'markdown';
  title?: string;
}

export interface MultimodalInput {
  text?: string;
  images?: ImageInput[];
  audio?: AudioInput;
  documents?: DocumentInput[];
}

export type ProcessingTask = 'structure' | 'analyze' | 'summarize' | 'extract' | 'describe';

export interface MultimodalResult {
  success: boolean;
  task: ProcessingTask;
  text?: string;
  structured?: Record<string, any>;
  modalities: {
    hasText: boolean;
    hasImages: boolean;
    hasAudio: boolean;
    hasDocuments: boolean;
  };
  processingDetails: {
    audioTranscript?: string;
    imageDescriptions?: string[];
    documentSummaries?: string[];
  };
}

export interface ResolvedReference {
  mediaId: string;
  mediaType: 'image' | 'video' | 'document';
  confidence: number;
  matchedOn: string[];
  url?: string;
}

export interface TemporalReference {
  start: Date;
  end: Date;
  type: 'absolute' | 'relative';
}

// ===========================================
// Configuration
// ===========================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

let claudeClient: Anthropic | null = null;

if (ANTHROPIC_API_KEY) {
  claudeClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

// ===========================================
// Task-Specific Prompts
// ===========================================

const TASK_PROMPTS: Record<ProcessingTask, { system: string; instruction: string }> = {
  structure: {
    system: `Du bist ein Experte für die Strukturierung von Informationen.
Extrahiere die wichtigsten Informationen und strukturiere sie in einem klaren JSON-Format.`,
    instruction: `Strukturiere diese Eingabe in folgendem Format:
{
  "title": "Kurzer Titel",
  "type": "idea|task|problem|question|insight",
  "category": "business|technical|personal|learning",
  "priority": "low|medium|high",
  "summary": "2-3 Sätze",
  "key_points": ["Punkt 1", "Punkt 2"],
  "action_items": ["Aktion 1"],
  "keywords": ["keyword1", "keyword2"]
}`,
  },
  analyze: {
    system: `Du bist ein analytischer Assistent. Analysiere die Eingabe gründlich und identifiziere Muster, Zusammenhänge und Erkenntnisse.`,
    instruction: `Analysiere diese Eingabe und gib folgende Informationen:
{
  "main_topic": "Hauptthema",
  "themes": ["Thema 1", "Thema 2"],
  "insights": ["Erkenntnis 1", "Erkenntnis 2"],
  "questions": ["Offene Frage 1"],
  "connections": ["Verbindung zu X"],
  "sentiment": "positive|neutral|negative",
  "confidence": 0.8
}`,
  },
  summarize: {
    system: `Du bist ein Experte für prägnante Zusammenfassungen. Fasse Informationen klar und verständlich zusammen.`,
    instruction: `Fasse diese Eingabe zusammen:
{
  "summary": "Zusammenfassung in 2-3 Sätzen",
  "key_takeaways": ["Takeaway 1", "Takeaway 2"],
  "context": "Kontext falls relevant"
}`,
  },
  extract: {
    system: `Du bist ein Informationsextraktions-Experte. Extrahiere strukturierte Daten aus unstrukturierten Eingaben.`,
    instruction: `Extrahiere folgende Informationen falls vorhanden:
{
  "entities": {"personen": [], "orte": [], "organisationen": [], "daten": []},
  "facts": ["Fakt 1", "Fakt 2"],
  "numbers": {"wert": "Bedeutung"},
  "relationships": ["X ist verbunden mit Y"]
}`,
  },
  describe: {
    system: `Du bist ein beschreibender Assistent. Beschreibe visuelle und textuelle Inhalte detailliert und präzise.`,
    instruction: `Beschreibe den Inhalt:
{
  "description": "Detaillierte Beschreibung",
  "elements": ["Element 1", "Element 2"],
  "mood": "Stimmung/Ton falls erkennbar",
  "notable_details": ["Detail 1", "Detail 2"]
}`,
  },
};

// ===========================================
// Multimodal Handler Class
// ===========================================

class MultimodalHandler {
  /**
   * Process multimodal input in a unified way
   */
  async processUnified(
    input: MultimodalInput,
    context: AIContext,
    task: ProcessingTask
  ): Promise<MultimodalResult> {
    if (!claudeClient) {
      throw new Error('Claude client not initialized');
    }

    const modalities = {
      hasText: !!input.text,
      hasImages: (input.images?.length || 0) > 0,
      hasAudio: !!input.audio,
      hasDocuments: (input.documents?.length || 0) > 0,
    };

    const processingDetails: MultimodalResult['processingDetails'] = {};

    try {
      // Get personalization context
      const unifiedContext = await getUnifiedContext(context);

      // Build task-specific system prompt
      const taskConfig = TASK_PROMPTS[task];
      let systemPrompt = taskConfig.system;

      // Add user context if available
      if (unifiedContext.contextDepthScore > 20 && unifiedContext.profile) {
        systemPrompt += `\n\n[Nutzer-Kontext: ${unifiedContext.profile.role || 'Unbekannt'}, Branche: ${unifiedContext.profile.industry || 'Unbekannt'}]`;
      }

      // Build multimodal content
      const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

      // 1. Add text content
      if (input.text) {
        content.push({ type: 'text', text: input.text });
      }

      // 2. Add images
      if (input.images && input.images.length > 0) {
        const imageDescriptions: string[] = [];

        for (const img of input.images) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType,
              data: img.base64,
            },
          });

          if (img.caption) {
            imageDescriptions.push(img.caption);
          }
        }

        processingDetails.imageDescriptions = imageDescriptions;
      }

      // 3. Transcribe and add audio
      if (input.audio) {
        try {
          const transcript = await this.transcribeAudioInput(input.audio);
          processingDetails.audioTranscript = transcript;

          content.push({
            type: 'text',
            text: `[Audio-Transkript]: ${transcript}`,
          });
        } catch (error) {
          logger.warn('Audio transcription failed', { error });
          content.push({
            type: 'text',
            text: '[Audio konnte nicht transkribiert werden]',
          });
        }
      }

      // 4. Add document content
      if (input.documents && input.documents.length > 0) {
        const documentSummaries: string[] = [];

        for (const doc of input.documents) {
          const docText = doc.title
            ? `[Dokument: ${doc.title}]\n${doc.content}`
            : `[Dokument (${doc.type})]\n${doc.content}`;

          content.push({ type: 'text', text: docText });
          documentSummaries.push(doc.title || `${doc.type} document`);
        }

        processingDetails.documentSummaries = documentSummaries;
      }

      // Add task instruction
      content.push({
        type: 'text',
        text: `\n\n${taskConfig.instruction}\n\nAntworte NUR mit dem JSON-Objekt.`,
      });

      logger.info('Processing multimodal input', {
        task,
        context,
        ...modalities,
        contentBlocks: content.length,
      });

      // Call Claude
      const response = await claudeClient.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      });

      const responseText = response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      let structured: Record<string, any> = {};

      if (jsonMatch) {
        try {
          structured = JSON.parse(jsonMatch[0]);
        } catch {
          logger.warn('Failed to parse JSON response', { response: responseText.substring(0, 200) });
        }
      }

      return {
        success: true,
        task,
        text: responseText,
        structured,
        modalities,
        processingDetails,
      };
    } catch (error) {
      logger.error('Multimodal processing failed', error instanceof Error ? error : undefined);

      return {
        success: false,
        task,
        modalities,
        processingDetails,
      };
    }
  }

  /**
   * Transcribe audio input using Whisper
   */
  private async transcribeAudioInput(audio: AudioInput): Promise<string> {
    // Convert base64 to buffer
    const buffer = Buffer.from(audio.base64, 'base64');

    // Get the file extension from mime type
    const extension = audio.mimeType.split('/')[1] || 'wav';
    const filename = `audio.${extension}`;

    // Use the existing whisper service
    const result = await transcribeAudio(buffer, filename);
    return result.text;
  }

  // ===========================================
  // Cross-Modal Reference Resolution
  // ===========================================

  /**
   * Resolve a natural language reference to a media item
   * e.g., "Das Whiteboard-Foto von gestern" → finds the right image
   */
  async resolveReference(
    reference: string,
    context: AIContext
  ): Promise<ResolvedReference | null> {
    try {
      // 1. Parse temporal references
      const temporal = this.parseTemporalReference(reference);

      // 2. Parse content hints
      const contentHints = this.parseContentHints(reference);

      // 3. Search in media items
      const candidates = await queryContext(
        context,
        `SELECT
           m.id,
           m.filename,
           m.media_type,
           m.ai_description,
           m.caption,
           m.created_at,
           ts_rank(
             to_tsvector('german', COALESCE(m.ai_description, '') || ' ' || COALESCE(m.caption, '') || ' ' || COALESCE(m.filename, '')),
             plainto_tsquery('german', $1)
           ) as relevance
         FROM media_items m
         WHERE m.context = $2
           AND m.created_at >= $3
           AND m.created_at <= $4
         ORDER BY relevance DESC, m.created_at DESC
         LIMIT 5`,
        [contentHints.join(' '), context, temporal.start, temporal.end]
      );

      if (candidates.rows.length === 0) {
        // Try without temporal filter
        const fallbackCandidates = await queryContext(
          context,
          `SELECT
             m.id,
             m.filename,
             m.media_type,
             m.ai_description,
             ts_rank(
               to_tsvector('german', COALESCE(m.ai_description, '') || ' ' || COALESCE(m.caption, '') || ' ' || COALESCE(m.filename, '')),
               plainto_tsquery('german', $1)
             ) as relevance
           FROM media_items m
           WHERE m.context = $2
           ORDER BY relevance DESC, m.created_at DESC
           LIMIT 3`,
          [contentHints.join(' '), context]
        );

        if (fallbackCandidates.rows.length === 0) {
          return null;
        }

        const best = fallbackCandidates.rows[0];
        return {
          mediaId: best.id,
          mediaType: best.media_type?.startsWith('video') ? 'video' : 'image',
          confidence: Math.min(parseFloat(best.relevance) * 10, 1) || 0.3,
          matchedOn: contentHints,
        };
      }

      const best = candidates.rows[0];
      return {
        mediaId: best.id,
        mediaType: best.media_type?.startsWith('video') ? 'video' : 'image',
        confidence: Math.min(parseFloat(best.relevance) * 10, 1) || 0.5,
        matchedOn: contentHints,
      };
    } catch (error) {
      logger.debug('Reference resolution failed', { reference, error });
      return null;
    }
  }

  /**
   * Parse temporal references from text
   */
  private parseTemporalReference(text: string): TemporalReference {
    const now = new Date();
    const textLower = text.toLowerCase();

    // Default: last 7 days
    let start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let end = now;
    let type: 'absolute' | 'relative' = 'relative';

    // Parse relative references
    if (/heute|today/i.test(textLower)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (/gestern|yesterday/i.test(textLower)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (/vorgestern/i.test(textLower)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    } else if (/diese woche|this week/i.test(textLower)) {
      const dayOfWeek = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    } else if (/letzte woche|last week/i.test(textLower)) {
      const dayOfWeek = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 7);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    } else if (/diesen monat|this month/i.test(textLower)) {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (/letzten monat|last month/i.test(textLower)) {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Parse "vor X tagen/wochen"
    const daysMatch = textLower.match(/vor (\d+) tag/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      end = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    }

    const weeksMatch = textLower.match(/vor (\d+) woche/);
    if (weeksMatch) {
      const weeks = parseInt(weeksMatch[1]);
      start = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    }

    return { start, end, type };
  }

  /**
   * Parse content hints from reference text
   */
  private parseContentHints(text: string): string[] {
    const hints: string[] = [];
    const textLower = text.toLowerCase();

    // Media type hints
    const mediaTypes = ['foto', 'photo', 'bild', 'image', 'screenshot', 'whiteboard', 'video', 'dokument', 'document', 'pdf'];
    for (const type of mediaTypes) {
      if (textLower.includes(type)) {
        hints.push(type);
      }
    }

    // Extract significant words (nouns, adjectives)
    const words = text
      .replace(/[^\w\säöüß]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !['heute', 'gestern', 'letzte', 'diese', 'von', 'mit', 'das', 'der', 'die', 'ein', 'eine'].includes(w.toLowerCase()));

    hints.push(...words);

    return [...new Set(hints)]; // Remove duplicates
  }

  // ===========================================
  // Convenience Methods
  // ===========================================

  /**
   * Process a single image
   */
  async processImage(
    image: ImageInput,
    context: AIContext,
    task: ProcessingTask = 'describe'
  ): Promise<MultimodalResult> {
    return this.processUnified({ images: [image] }, context, task);
  }

  /**
   * Process text with optional images
   */
  async processTextWithImages(
    text: string,
    images: ImageInput[],
    context: AIContext,
    task: ProcessingTask = 'structure'
  ): Promise<MultimodalResult> {
    return this.processUnified({ text, images }, context, task);
  }

  /**
   * Process audio memo
   */
  async processAudio(
    audio: AudioInput,
    context: AIContext,
    task: ProcessingTask = 'structure'
  ): Promise<MultimodalResult> {
    return this.processUnified({ audio }, context, task);
  }

  /**
   * Check if multimodal processing is available
   */
  isAvailable(): boolean {
    return !!claudeClient;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const multimodalHandler = new MultimodalHandler();
