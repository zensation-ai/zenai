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
  SubPersonaConfig,
} from '../config/personas';
import { normalizeCategory, normalizeType, normalizePriority } from '../utils/ollama';
import { generateEmbedding } from '../services/ai'; // Unified AI - Ollama embeddings
import { formatForPgVector } from '../utils/embedding';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';
// Phase 23: Proactive Research Integration
import { processIdeaForResearch } from '../services/proactive-intelligence';
import { getActiveFocusContext, findMatchingFocus } from '../services/domain-focus';
// Phase 24: Business Profile Learning
import { learnFromIdea } from '../services/business-profile-learning';
// Phase 25: Proactive Draft Generation
import { generateProactiveDraft, GeneratedDraft } from '../services/draft-generation';
// OpenAI for JSON queries (text generation only, not embeddings)
import { isOpenAIAvailable, queryOpenAIJSON } from '../services/openai';
// Claude with personalized context (primary)
import {
  isClaudeAvailable,
  structureWithClaudePersonalized,
  calculateConfidence,
  getConfidenceLevel,
} from '../services/claude';

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
    const buffer = Buffer.from(audioBase64, 'base64');
    const transcriptionResult = await transcribeAudio(buffer, 'audio.webm');
    transcript = transcriptionResult.text;
  } else {
    throw new ValidationError('Either audio file, audioBase64, or text required');
  }

  // Get the selected persona (or default for context)
  const persona = getSubPersona(context as AIContext, effectivePersonaId as SubPersonaId | undefined);
  const immediateStructure = shouldImmediatelyStructure(context as AIContext, effectivePersonaId as SubPersonaId | undefined);

  if (immediateStructure) {
    // WORK MODE: Structure immediately
    const structured = await structureThoughtWithPersona(transcript, context as AIContext, effectivePersonaId as SubPersonaId | undefined);

    // Generate embedding
    const embedding = await generateEmbedding(structured.summary + ' ' + structured.title);

    // Save to work database
    const ideaId = uuidv4();
    await queryContext(
      context as AIContext,
      `INSERT INTO ideas
       (id, title, type, category, priority, summary, raw_transcript, embedding,
        next_steps, context_needed, keywords, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
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
      ]
    );

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
    } catch (error) {
      // Don't fail if learning fails
      logger.debug('Profile learning failed', { ideaId });
    }

    // Phase 25: Proactive Draft Generation (non-blocking)
    let proactiveDraft: GeneratedDraft | null = null;
    try {
      if (structured.type === 'task') {
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
        }
      }
    } catch (error) {
      // Don't fail the main request if draft generation fails
      logger.warn('Proactive draft generation failed', { ideaId, error });
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
      // Note: Supabase schema has raw_text (NOT NULL) as original column
      // raw_input was added later and is nullable
      // We populate both for compatibility
      await queryContext(
        context as AIContext,
        `INSERT INTO loose_thoughts
         (id, user_id, raw_text, raw_input, source, user_tags, embedding, is_processed, created_at)
         VALUES ($1, 'default', $2, $2, 'voice', '[]'::jsonb, $3, false, NOW())`,
        [
          thoughtId,
          transcript,
          embedding.length > 0 ? formatForPgVector(embedding) : null,
        ]
      );
      logger.info('Thought saved to loose_thoughts', { thoughtId, context });
    } catch (dbError: any) {
      logger.error('Failed to save to loose_thoughts', dbError instanceof Error ? dbError : undefined, {
        thoughtId,
        context,
        errorCode: dbError?.code,
        errorDetail: dbError?.detail,
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
): Promise<any> {
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
    } catch (error: any) {
      logger.warn('Claude personalized structuring failed, trying OpenAI', { error: error.message });
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
      const parsed = await queryOpenAIJSON<any>(systemPrompt, userPrompt);

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
      logger.warn('OpenAI structuring failed, trying Ollama', { error: error.message });
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
  } catch (error: any) {
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
      error: 'Invalid context. Use "personal" or "work".'
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
