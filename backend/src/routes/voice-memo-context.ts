/**
 * Context-Aware Voice Memo Routes
 *
 * Handles voice memos with context switching between Personal and Work modes.
 * Different personas apply different structuring approaches.
 */

import { Router, Request, Response } from 'express';
import { transcribeAudio } from '../services/whisper';
import { queryContext, AIContext, isValidContext } from '../utils/database-context';
import { getPersona, shouldImmediatelyStructure } from '../config/personas';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export const voiceMemoContextRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * POST /api/:context/voice-memo
 *
 * Process a voice memo in the specified context (personal or work)
 * Uses context-specific persona for structuring
 */
voiceMemoContextRouter.post('/:context/voice-memo', async (req: Request, res: Response) => {
  const { context } = req.params;

  // Validate context
  if (!isValidContext(context)) {
    return res.status(400).json({
      error: 'Invalid context. Must be "personal" or "work"'
    });
  }

  const startTime = Date.now();
  const { audioBase64, text } = req.body;

  try {
    let transcript: string;

    if (text) {
      // Direct text input
      transcript = text;
    } else if (audioBase64) {
      // Transcribe audio
      const buffer = Buffer.from(audioBase64, 'base64');
      const transcriptionResult = await transcribeAudio(buffer, 'audio.webm');
      transcript = transcriptionResult.text;
    } else {
      return res.status(400).json({
        error: 'Either audioBase64 or text required'
      });
    }

    const persona = getPersona(context as AIContext);
    const immediateStructure = shouldImmediatelyStructure(context as AIContext);

    if (immediateStructure) {
      // WORK MODE: Structure immediately
      const structured = await structureThoughtWithPersona(transcript, context as AIContext);

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

      const duration = Date.now() - startTime;

      return res.json({
        success: true,
        context,
        persona: persona.displayName,
        mode: 'structured',
        idea: {
          id: ideaId,
          ...structured,
        },
        processingTime: duration,
      });

    } else {
      // PERSONAL MODE: Add to incubator first
      const embedding = await generateEmbedding(transcript);
      const thoughtId = uuidv4();

      await queryContext(
        context as AIContext,
        `INSERT INTO loose_thoughts
         (id, user_id, raw_input, source, user_tags, embedding, is_processed, created_at)
         VALUES ($1, 'default', $2, 'voice', '[]', $3, false, NOW())`,
        [
          thoughtId,
          transcript,
          embedding.length > 0 ? formatForPgVector(embedding) : null,
        ]
      );

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

  } catch (error: any) {
    console.error(`Error processing voice memo in ${context} context:`, error);
    return res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Structure a thought using context-specific persona
 */
async function structureThoughtWithPersona(
  transcript: string,
  context: AIContext
): Promise<any> {
  const persona = getPersona(context);

  const prompt = `${persona.systemPrompt}

Transkript: ${transcript}

Strukturiere diesen Gedanken. Antworte NUR mit einem JSON-Objekt (keine Erklärung):
{
  "title": "Kurzer, prägnanter Titel (max 50 Zeichen)",
  "type": "idea|task|problem|question|insight",
  "category": "${context === 'work' ? 'EwS|1komma5|Kunden|Strategie|Technik|Business|Marketing|Team' : 'personal|family|health|learning|hobby'}",
  "priority": "low|medium|high",
  "summary": "2-3 Sätze Zusammenfassung",
  "next_steps": ["Schritt 1", "Schritt 2"],
  "context_needed": ["Kontext 1"],
  "keywords": ["keyword1", "keyword2"]
}`;

  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: persona.modelName,
      prompt,
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

  return JSON.parse(jsonMatch[0]);
}

/**
 * GET /api/:context/stats
 *
 * Get statistics for a specific context
 */
voiceMemoContextRouter.get('/:context/stats', async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    return res.status(400).json({
      error: 'Invalid context. Must be "personal" or "work"'
    });
  }

  try {
    const [ideasCount, thoughtsCount, clustersCount] = await Promise.all([
      queryContext(context as AIContext, 'SELECT COUNT(*) as count FROM ideas'),
      queryContext(context as AIContext, 'SELECT COUNT(*) as count FROM loose_thoughts'),
      queryContext(context as AIContext, "SELECT COUNT(*) as count FROM thought_clusters WHERE status = 'ready'"),
    ]);

    const persona = getPersona(context as AIContext);

    res.json({
      context,
      persona: {
        name: persona.displayName,
        icon: persona.icon,
      },
      stats: {
        total_ideas: parseInt(ideasCount.rows[0].count),
        loose_thoughts: parseInt(thoughtsCount.rows[0].count),
        ready_clusters: parseInt(clustersCount.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error(`Error fetching stats for ${context}:`, error);
    res.status(500).json({ error: error.message });
  }
});
