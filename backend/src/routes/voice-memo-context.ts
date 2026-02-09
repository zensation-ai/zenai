/**
 * Context-Aware Voice Memo Routes
 *
 * Handles voice memos with context switching between Personal and Work modes.
 * Different personas apply different structuring approaches.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { transcribeAudio } from '../services/whisper';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import {
  getSubPersona,
  getAvailablePersonas,
  isValidPersonaForContext,
  shouldImmediatelyStructure,
  SubPersonaId,
} from '../config/personas';
import { normalizeCategory, normalizeType, normalizePriority } from '../utils/ollama';
import { generateEmbedding } from '../services/ai';
import { formatForPgVector } from '../utils/embedding';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { extractStructuredKnowledge } from '../services/structured-extraction';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
// Phase 23: Proactive Research Integration
import { processIdeaForResearch } from '../services/proactive-intelligence';
// Phase 24: Cache Invalidation
import { invalidateCacheForContext } from '../middleware/response-cache';
import { getActiveFocusContext, findMatchingFocus } from '../services/domain-focus';
// Phase 24: Business Profile Learning
import { learnFromIdea } from '../services/business-profile-learning';
// Phase 25: Proactive Draft Generation
import { generateProactiveDraft, GeneratedDraft } from '../services/draft-generation';
// Phase 10: Duplicate Detection
import { isLikelyDuplicate, findDuplicates } from '../services/duplicate-detection';
// OpenAI for JSON queries (text generation only, not embeddings)
import { isOpenAIAvailable, queryOpenAIJSON } from '../services/openai';
// Claude with personalized context (primary)
import {
  isClaudeAvailable,
  structureWithClaudePersonalized,
  calculateConfidence,
  getConfidenceLevel,
} from '../services/claude';
import type { StructuredIdea } from '../types';

/**
 * Raw structured input from LLM before normalization
 * Used for type-safe parsing of LLM JSON responses
 */
interface RawStructuredInput {
  title?: string;
  type?: string;
  category?: string;
  priority?: string;
  summary?: string;
  next_steps?: string[] | unknown;
  context_needed?: string[] | unknown;
  keywords?: string[] | unknown;
}

export const voiceMemoContextRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Configure multer for audio file uploads (same as voice-memo.ts)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // SECURITY: Only allow specific audio MIME types
    // application/octet-stream removed to prevent arbitrary file uploads
    const allowedTypes = [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/webm',
      'audio/ogg',
      'audio/m4a',
      'audio/mp4',
      'audio/x-m4a',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio format: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/:context/voice-memo
 *
 * Process a voice memo in the specified context (personal or work)
 * Uses context-specific persona for structuring
 *
 * Supports both:
 * - FormData with 'audio' file (from RecordButton)
 * - JSON with 'text' or 'audioBase64' fields
 *
 * Optional 'persona' parameter to select a specific sub-persona
 */
voiceMemoContextRouter.post('/:context/voice-memo', apiKeyAuth, requireScope('write'), upload.single('audio'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  // Validate context
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const startTime = Date.now();
  const { audioBase64, text, persona: personaId } = req.body;
  const audioFile = req.file; // From multer (FormData upload)

  // Auto-fallback to default persona if the provided one is invalid for this context
  // This handles context switches gracefully (e.g., switching from personal to work while "companion" is selected)
  let effectivePersonaId = personaId;
  if (personaId && !isValidPersonaForContext(context as AIContext, personaId)) {
    logger.info('Persona fallback', {
      requestedPersona: personaId,
      context,
      reason: 'Invalid persona for context, using default'
    });
    effectivePersonaId = undefined; // Will use context default
  }

  let transcript: string;

  if (text) {
    // Direct text input (JSON body)
    transcript = text;
  } else if (audioFile) {
    // Audio file from FormData (RecordButton)
    const transcriptionResult = await transcribeAudio(audioFile.buffer, audioFile.originalname);
    transcript = transcriptionResult.text;
  } else if (audioBase64) {
    // Base64 audio (JSON body)
    // Validate base64 string format before decoding
    if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
      throw new ValidationError('Invalid audioBase64: must be a non-empty string');
    }
    // Basic base64 format validation
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    const cleanBase64 = audioBase64.replace(/\s/g, '');
    if (!base64Regex.test(cleanBase64)) {
      throw new ValidationError('Invalid audioBase64: not a valid base64 string');
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(cleanBase64, 'base64');
      // Check if buffer has actual content (at least a minimal audio header)
      if (buffer.length < 100) {
        throw new ValidationError('Invalid audioBase64: decoded data too small for valid audio');
      }
    } catch (error) {
      if (error instanceof ValidationError) {throw error;}
      throw new ValidationError('Invalid audioBase64: failed to decode base64 data');
    }
    const transcriptionResult = await transcribeAudio(buffer, 'audio.webm');
    transcript = transcriptionResult.text;
  } else {
    throw new ValidationError('Either audio file, audioBase64, or text required');
  }

  // Check for transcribeOnly mode (for VoiceInput chat integration)
  const transcribeOnly = req.body.transcribeOnly === 'true' || req.body.transcribeOnly === true;

  if (transcribeOnly) {
    // Return only the transcript without creating an idea
    const duration = Date.now() - startTime;
    logger.info('Transcribe-only completed', { context, duration });

    return res.json({
      success: true,
      context,
      mode: 'transcribe_only',
      transcript: transcript.trim(),
      duration,
    });
  }

  // Get the selected persona (or default for context)
  const persona = getSubPersona(context as AIContext, effectivePersonaId as SubPersonaId | undefined);
  const immediateStructure = shouldImmediatelyStructure(context as AIContext, effectivePersonaId as SubPersonaId | undefined);

  if (immediateStructure) {
    // WORK MODE: Structure immediately
    const structured = await structureThoughtWithPersona(transcript, context as AIContext, effectivePersonaId as SubPersonaId | undefined);

    // Generate embedding
    const embedding = await generateEmbedding(structured.summary + ' ' + structured.title);

    // Phase 10: Check for duplicates before saving
    const isDuplicate = await isLikelyDuplicate(
      context as AIContext,
      structured.title,
      transcript
    );

    if (isDuplicate) {
      // Find the similar ideas to return to user
      const duplicates = await findDuplicates(context as AIContext, transcript, 0.85);
      logger.warn('Duplicate idea detected, rejecting', {
        title: structured.title,
        duplicateCount: duplicates.count,
        firstMatch: duplicates.suggestions[0]?.title,
      });

      return res.status(409).json({
        success: false,
        error: 'Ein sehr ähnlicher Gedanke existiert bereits.',
        code: 'DUPLICATE_ENTRY',
        existingIdeas: duplicates.suggestions.map(d => ({
          id: d.id,
          title: d.title,
          similarity: Math.round(d.similarity * 100),
        })),
      });
    }

    // Save to database
    // CRITICAL: is_archived must be explicitly set to false because the personal/work
    // schema tables were created with CREATE TABLE AS SELECT which doesn't copy DEFAULT values.
    // Without this, is_archived would be NULL and the idea wouldn't appear in queries.
    const ideaId = uuidv4();
    await queryContext(
      context as AIContext,
      `INSERT INTO ideas
       (id, title, type, category, priority, summary, raw_transcript, embedding,
        next_steps, context_needed, keywords, context, is_archived, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [
        ideaId,
        structured.title,
        structured.type,
        structured.category,
        structured.priority,
        structured.summary,
        transcript,
        embedding.length > 0 ? formatForPgVector(embedding) : null,
        JSON.stringify(structured.next_steps || []),
        JSON.stringify(structured.context_needed || []),
        JSON.stringify(structured.keywords || []),
        context,
        false, // is_archived - explicitly set to avoid NULL
      ]
    );

    // Phase 24: Invalidate ideas cache so new idea appears immediately
    // This is critical - without this, GET /api/:context/ideas returns stale cached data
    try {
      await invalidateCacheForContext(context as AIContext, 'ideas');
      logger.debug('Ideas cache invalidated after new idea', { context, ideaId });
    } catch {
      // Don't fail if cache invalidation fails
      logger.warn('Failed to invalidate ideas cache', { context, ideaId });
    }

    // Phase 23: Check for proactive research needs (non-blocking)
    let proactiveResearch = null;
    let matchingFocus = null;
    try {
      // Check if this idea matches a domain focus
      matchingFocus = await findMatchingFocus(
        `${structured.title} ${structured.summary}`,
        context as AIContext
      );

      // Check if this idea needs research (tasks with research keywords)
      proactiveResearch = await processIdeaForResearch(
        ideaId,
        `${structured.title} ${structured.summary} ${transcript}`,
        structured.type,
        context as AIContext
      );

      if (proactiveResearch) {
        logger.info('Proactive research triggered for new idea', {
          ideaId,
          researchId: proactiveResearch.id,
          query: proactiveResearch.research_query,
        });
      }
    } catch (error) {
      // Don't fail the main request if research fails
      logger.warn('Proactive research check failed', { ideaId, error });
    }

    // Phase 24: Learn from this idea for profile building (non-blocking)
    try {
      await learnFromIdea(
        ideaId,
        structured.title,
        `${structured.summary || ''} ${transcript}`,
        structured.type,
        structured.category,
        structured.keywords || [],
        context as AIContext
      );
    } catch {
      // Don't fail if learning fails
      logger.debug('Profile learning failed', { ideaId });
    }

    // Phase 25: Proactive Draft Generation (non-blocking)
    let proactiveDraft: GeneratedDraft | null = null;
    try {
      // Enhanced logging for draft generation debugging
      logger.info('Draft generation check', {
        ideaId,
        type: structured.type,
        isTask: structured.type === 'task',
        claudeAvailable: isClaudeAvailable(),
        title: structured.title,
        transcriptPreview: transcript.substring(0, 100),
      });

      if (structured.type === 'task') {
        logger.info('Attempting draft generation for task', { ideaId, title: structured.title });

        proactiveDraft = await generateProactiveDraft({
          ideaId,
          title: structured.title,
          summary: structured.summary || '',
          rawTranscript: transcript,
          keywords: structured.keywords || [],
          type: structured.type,
          category: structured.category,
          context: context as AIContext,
        });

        if (proactiveDraft) {
          logger.info('Proactive draft generated for task', {
            ideaId,
            draftId: proactiveDraft.id,
            draftType: proactiveDraft.draftType,
            wordCount: proactiveDraft.wordCount,
          });
        } else {
          logger.info('No draft generated - pattern not matched or Claude unavailable', {
            ideaId,
            title: structured.title,
          });
        }
      } else {
        logger.debug('Skipping draft generation - not a task', {
          ideaId,
          type: structured.type,
        });
      }
    } catch (error: unknown) {
      // Don't fail the main request if draft generation fails
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.warn('Proactive draft generation failed', {
        ideaId,
        error: errorMessage,
        stack: errorStack,
      });
    }

    const duration = Date.now() - startTime;

    // Phase 27: Calculate confidence scores
    const confidence = calculateConfidence(structured, transcript);
    const confidenceLevel = getConfidenceLevel(confidence.overall);

    return res.json({
      success: true,
      context,
      persona: persona.displayName,
      mode: 'structured',
      // Frontend compatibility: ideaId and structured at top level
      ideaId,
      transcript,
      structured,
      suggestedContext: structured.suggested_context || null,
      // Also include idea object for other consumers
      idea: {
        id: ideaId,
        ...structured,
      },
      // Phase 27: Confidence scores for UI indicators
      confidence,
      confidenceLevel,
      suggestCorrection: confidenceLevel === 'low',
      // Phase 23: Include proactive research if available
      proactiveResearch: proactiveResearch ? {
        id: proactiveResearch.id,
        teaser_title: proactiveResearch.teaser_title,
        teaser_text: proactiveResearch.teaser_text,
        status: proactiveResearch.status,
      } : null,
      matchingFocus: matchingFocus ? {
        id: matchingFocus.id,
        name: matchingFocus.name,
      } : null,
      // Phase 25: Include proactive draft if available
      proactiveDraft: proactiveDraft ? {
        id: proactiveDraft.id,
        draftType: proactiveDraft.draftType,
        snippet: proactiveDraft.content.substring(0, 200) + (proactiveDraft.content.length > 200 ? '...' : ''),
        wordCount: proactiveDraft.wordCount,
        status: proactiveDraft.status,
      } : null,
      processingTime: duration,
    });

  } else {
    // PERSONAL MODE: Add to incubator first
    let embedding: number[] = [];
    try {
      embedding = await generateEmbedding(transcript);
      logger.info('Embedding generated for personal thought', { dimensions: embedding.length });
    } catch (embeddingError) {
      logger.warn('Embedding generation failed, proceeding without embedding', { error: embeddingError });
    }

    const thoughtId = uuidv4();

    try {
      // Note: raw_text is legacy column, raw_input is new - set both for compatibility
      await queryContext(
        context as AIContext,
        `INSERT INTO loose_thoughts
         (id, user_id, raw_input, raw_text, source, user_tags, embedding, is_processed, created_at)
         VALUES ($1, 'default', $2, $2, 'voice', '[]'::jsonb, $3, false, NOW())`,
        [
          thoughtId,
          transcript,
          embedding.length > 0 ? formatForPgVector(embedding) : null,
        ]
      );
      logger.info('Thought saved to loose_thoughts', { thoughtId, context });
    } catch (dbError: unknown) {
      const err = dbError as { code?: string; detail?: string };
      logger.error('Failed to save to loose_thoughts', dbError instanceof Error ? dbError : undefined, {
        thoughtId,
        context,
        errorCode: err?.code,
        errorDetail: err?.detail,
      });
      throw dbError;
    }

    const duration = Date.now() - startTime;

    return res.json({
      success: true,
      context,
      persona: persona.displayName,
      mode: 'incubated',
      thought: {
        id: thoughtId,
        raw_input: transcript,
      },
      message: `${persona.icon} ${persona.displayName}: Ich habe deinen Gedanken notiert. Er inkubiert jetzt und ich suche nach Mustern...`,
      processingTime: duration,
    });
  }
}));

/**
 * Structure a thought using context-specific persona
 * Priority: Claude (personalized) → OpenAI → Ollama → Basic fallback
 */
async function structureThoughtWithPersona(
  transcript: string,
  context: AIContext,
  personaId?: SubPersonaId
): Promise<StructuredIdea> {
  const persona = getSubPersona(context, personaId);

  // Phase 23: Get active focus context for enhanced relevance
  let focusContext = '';
  try {
    focusContext = await getActiveFocusContext(context);
  } catch (error) {
    logger.warn('Could not get focus context', { error });
  }

  // Try Claude first with personalized context (Phase 2: Unified Business Context)
  if (isClaudeAvailable()) {
    try {
      logger.info('Structuring with Claude (personalized)', { context, personaId });
      const result = await structureWithClaudePersonalized(transcript, context);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Claude personalized structuring failed, trying OpenAI', { error: errorMessage });
    }
  }

  const systemPrompt = `${persona.systemPrompt}
${focusContext}

Du strukturierst Gedanken und Sprachmemos. Antworte NUR mit einem JSON-Objekt.

OUTPUT FORMAT:
{
  "title": "Kurzer, prägnanter Titel (max 50 Zeichen)",
  "type": "idea|task|problem|question|insight",
  "category": "${context === 'work' ? 'business|technical|personal|learning' : 'personal|business|technical|learning'}",
  "priority": "low|medium|high",
  "summary": "2-3 Sätze Zusammenfassung",
  "next_steps": ["Schritt 1", "Schritt 2"],
  "context_needed": ["Kontext 1"],
  "keywords": ["keyword1", "keyword2"]
}`;

  const userPrompt = `Transkript: ${transcript}`;

  // Try OpenAI as fallback (works on Railway)
  if (isOpenAIAvailable()) {
    try {
      logger.info('Structuring with OpenAI', { context, personaId });
      const parsed = await queryOpenAIJSON<RawStructuredInput>(systemPrompt, userPrompt);

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('OpenAI structuring failed, trying Ollama', { error: errorMessage });
    }
  }

  // Fallback to Ollama (local development)
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: persona.modelName,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        options: {
          temperature: persona.temperature,
        },
      },
      { timeout: 60000 }
    );

    const content = response.data.response;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Invalid LLM response - no JSON found');
    }

    const parsed = JSON.parse(jsonMatch[0]);

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
    logger.error('Both OpenAI and Ollama failed', error instanceof Error ? error : undefined);

    // Basic fallback - return unstructured
    return {
      title: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
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
 * POST /api/:context/voice-memo/extract
 *
 * Phase 32E: Extract structured knowledge from a transcription.
 * Returns core ideas, action items, mentions, mood, and auto-links.
 */
voiceMemoContextRouter.post('/:context/voice-memo/extract', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const { transcript } = req.body;
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 10) {
    throw new ValidationError('Transcript is required (min 10 characters).');
  }

  const enableAutoLinking = req.body.enableAutoLinking !== false;

  const result = await extractStructuredKnowledge(
    transcript.trim(),
    context as AIContext,
    { enableAutoLinking }
  );

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/:context/stats
 *
 * Get statistics for a specific context
 */
voiceMemoContextRouter.get('/:context/stats', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }

  const [ideasCount, thoughtsCount, clustersCount] = await Promise.all([
    queryContext(context as AIContext, 'SELECT COUNT(*) as count FROM ideas'),
    queryContext(context as AIContext, 'SELECT COUNT(*) as count FROM loose_thoughts'),
    queryContext(context as AIContext, "SELECT COUNT(*) as count FROM thought_clusters WHERE status = 'ready'"),
  ]);

  const persona = getSubPersona(context as AIContext);

  res.json({
    context,
    persona: {
      id: persona.id,
      name: persona.displayName,
      icon: persona.icon,
    },
    stats: {
      total_ideas: parseInt(ideasCount.rows[0].count),
      loose_thoughts: parseInt(thoughtsCount.rows[0].count),
      ready_clusters: parseInt(clustersCount.rows[0].count),
    },
  });
}));

/**
 * GET /api/:context/personas
 *
 * Get available personas for a context
 */
voiceMemoContextRouter.get('/:context/personas', apiKeyAuth, (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid context. Use "personal" or "work".',
      code: 'VALIDATION_ERROR',
    });
  }

  const personas = getAvailablePersonas(context as AIContext);
  const defaultPersona = getSubPersona(context as AIContext);

  res.json({
    context,
    default: defaultPersona.id,
    personas: personas.map(p => ({
      id: p.id,
      displayName: p.displayName,
      icon: p.icon,
      description: p.description,
      isDefault: p.id === defaultPersona.id,
    })),
  });
});
