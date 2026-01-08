import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { structureWithOllama, generateEmbedding } from '../utils/ollama';
import { quantizeToInt8, quantizeToBinary, formatForPgVector } from '../utils/embedding';
import { query } from '../utils/database';
import { transcribeAudio, checkWhisperAvailable } from '../services/whisper';
import { analyzeRelationships } from '../services/knowledge-graph';
import { trackInteraction, suggestPriority } from '../services/user-profile';
import { triggerWebhook } from '../services/webhooks';
import { learnFromThought, suggestFromLearning } from '../services/learning-engine';

export const voiceMemoRouter = Router();

// Configure multer for audio file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
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
      'application/octet-stream', // Allow unknown types, Whisper will validate
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio format: ${file.mimetype}`));
    }
  },
});

/**
 * Helper function to store idea in database
 */
async function storeIdea(
  ideaId: string,
  structured: any,
  transcript: string,
  embedding: number[]
) {
  const embeddingInt8 = quantizeToInt8(embedding);
  const embeddingBinary = quantizeToBinary(embedding);

  if (embedding.length > 0) {
    await query(
      `INSERT INTO ideas (
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords,
        raw_transcript, embedding, embedding_int8, embedding_binary,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13,
        NOW(), NOW()
      )`,
      [
        ideaId,
        structured.title,
        structured.type,
        structured.category,
        structured.priority,
        structured.summary,
        JSON.stringify(structured.next_steps),
        JSON.stringify(structured.context_needed),
        JSON.stringify(structured.keywords),
        transcript,
        formatForPgVector(embedding),
        JSON.stringify(embeddingInt8),
        embeddingBinary,
      ]
    );
  } else {
    await query(
      `INSERT INTO ideas (
        id, title, type, category, priority, summary,
        next_steps, context_needed, keywords,
        raw_transcript, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, NOW(), NOW()
      )`,
      [
        ideaId,
        structured.title,
        structured.type,
        structured.category,
        structured.priority,
        structured.summary,
        JSON.stringify(structured.next_steps),
        JSON.stringify(structured.context_needed),
        JSON.stringify(structured.keywords),
        transcript,
      ]
    );
  }
}

/**
 * POST /api/voice-memo
 * Process a voice memo: transcribe → structure → embed → store
 * Accepts audio file upload OR transcript in body
 */
voiceMemoRouter.post('/', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const startTime = Date.now();

  try {
    let transcript: string;
    let transcriptionTime = 0;

    // Check if audio file was uploaded
    if (req.file) {

      // Transcribe audio with Whisper
      const transcribeStart = Date.now();
      const transcriptionResult = await transcribeAudio(
        req.file.buffer,
        req.file.originalname
      );
      transcriptionTime = Date.now() - transcribeStart;

      transcript = transcriptionResult.text;
    } else {
      // Fall back to transcript in body
      transcript = req.body.transcript || req.body.text;
    }

    if (!transcript) {
      return res.status(400).json({
        error: 'No audio file or transcript provided.',
        hint: 'Upload an audio file or send {"text": "your text"} in the body.',
      });
    }

    // Get personalized suggestions from learning engine BEFORE structuring
    const learnedSuggestion = await suggestFromLearning(transcript).catch(() => null);

    // 1. Structure with Ollama/Mistral
    const structureStart = Date.now();
    const structured = await structureWithOllama(transcript);
    // Apply learned suggestions if confidence is high enough
    let appliedLearning = false;
    if (learnedSuggestion && learnedSuggestion.confidence >= 0.5) {
      if (learnedSuggestion.suggested_category !== structured.category) {
        structured.category = learnedSuggestion.suggested_category as typeof structured.category;
        appliedLearning = true;
      }
      if (learnedSuggestion.suggested_priority !== structured.priority) {
        structured.priority = learnedSuggestion.suggested_priority as typeof structured.priority;
        appliedLearning = true;
      }
    }

    // 2. Generate embedding
    const embedding = await generateEmbedding(transcript);

    // 3. Store in database
    const ideaId = uuidv4();
    await storeIdea(ideaId, structured, transcript, embedding);
    const totalTime = Date.now() - startTime;

    // Background tasks: Knowledge Graph analysis, user profile tracking, webhooks, learning
    // Fire-and-forget: These run async to not block the response (void indicates intentional no-await)
    void Promise.allSettled([
      analyzeRelationships(ideaId).catch((err) =>
        console.log('Background relationship analysis skipped:', err.message)
      ),
      trackInteraction({
        idea_id: ideaId,
        interaction_type: 'edit',
        metadata: { action: 'create', source: 'voice-memo' },
      }).catch((err) =>
        console.log('Background tracking skipped:', err.message)
      ),
      triggerWebhook('idea.created', {
        id: ideaId,
        ...structured,
        source: 'voice-memo'
      }).catch((err) =>
        console.log('Background webhook skipped:', err.message)
      ),
      // Learn from this thought to improve future suggestions
      learnFromThought(ideaId).catch((err) =>
        console.log('Background learning skipped:', err.message)
      ),
    ]);

    res.json({
      success: true,
      ideaId,
      transcript,
      structured,
      appliedLearning,
      learningConfidence: learnedSuggestion?.confidence || 0,
      performance: {
        totalMs: totalTime,
        transcriptionMs: transcriptionTime,
        embeddingDimensions: embedding.length,
      },
    });
  } catch (error: any) {
    console.error('Voice memo processing error:', error);
    res.status(500).json({
      error: error.message,
      hint: 'Make sure Ollama and Whisper are running.',
    });
  }
});

/**
 * POST /api/voice-memo/text
 * Process plain text (no audio file)
 */
voiceMemoRouter.post('/text', async (req, res) => {
  const startTime = Date.now();

  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    console.log(`Processing text: "${text.substring(0, 50)}..."`);

    // Get personalized suggestions from learning engine BEFORE structuring
    const learnedSuggestion = await suggestFromLearning(text).catch(() => null);

    const structured = await structureWithOllama(text);
    const embedding = await generateEmbedding(text);

    const ideaId = uuidv4();

    // Apply learned suggestions if confidence is high enough
    // CONFIDENCE_FOR_OVERRIDE ist auf 0.5 gesetzt für schnelleres Lernen
    let appliedLearning = false;
    if (learnedSuggestion && learnedSuggestion.confidence >= 0.5) {
      // Override with learned preferences if significantly different
      if (learnedSuggestion.suggested_category !== structured.category) {
        console.log(`Learning override: category ${structured.category} -> ${learnedSuggestion.suggested_category}`);
        structured.category = learnedSuggestion.suggested_category as typeof structured.category;
        appliedLearning = true;
      }
      if (learnedSuggestion.suggested_priority !== structured.priority) {
        console.log(`Learning override: priority ${structured.priority} -> ${learnedSuggestion.suggested_priority}`);
        structured.priority = learnedSuggestion.suggested_priority as typeof structured.priority;
        appliedLearning = true;
      }
    }

    // Also check keyword-based priority suggestion
    const keywords = structured.keywords || [];
    const suggestedPrio = await suggestPriority(keywords);

    await storeIdea(ideaId, structured, text, embedding);

    // Background tasks including learning
    // Fire-and-forget: void indicates intentional no-await
    void Promise.allSettled([
      analyzeRelationships(ideaId).catch((err) =>
        console.log('Background relationship analysis skipped:', err.message)
      ),
      trackInteraction({
        idea_id: ideaId,
        interaction_type: 'edit',
        metadata: { action: 'create', source: 'text' },
      }).catch((err) =>
        console.log('Background tracking skipped:', err.message)
      ),
      triggerWebhook('idea.created', {
        id: ideaId,
        ...structured,
        source: 'text'
      }).catch((err) =>
        console.log('Background webhook skipped:', err.message)
      ),
      // Learn from this thought
      learnFromThought(ideaId).catch((err) =>
        console.log('Background learning skipped:', err.message)
      ),
    ]);

    res.json({
      success: true,
      ideaId,
      transcript: text,
      structured,
      suggestedPriority: suggestedPrio,
      appliedLearning,
      learningConfidence: learnedSuggestion?.confidence || 0,
      processingTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Text processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voice-memo/transcribe
 * Only transcribe audio, don't structure or store
 */
voiceMemoRouter.post('/transcribe', upload.single('audio'), async (req, res) => {
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log(`Transcribing: ${req.file.originalname} (${req.file.size} bytes)`);

    const result = await transcribeAudio(req.file.buffer, req.file.originalname);

    res.json({
      success: true,
      transcript: result.text,
      language: result.language,
      processingTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice-memo/whisper-status
 * Check if Whisper is available
 */
voiceMemoRouter.get('/whisper-status', async (req, res) => {
  const available = await checkWhisperAvailable();
  res.json({
    whisperAvailable: available,
    model: process.env.WHISPER_MODEL || 'base',
  });
});
