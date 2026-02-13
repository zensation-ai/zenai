/**
 * Phase 21: Personalization Chat - "Lerne mich kennen"
 *
 * Enables conversational learning about the user:
 * - AI asks thoughtful questions
 * - Extracts and stores personal facts
 * - Builds a comprehensive user profile over time
 * SECURITY: All endpoints require authentication - handles sensitive personal data
 */

import { Router, Request, Response } from 'express';
import { getPool } from '../utils/database-context';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { generateOpenAIResponse, isOpenAIAvailable } from '../services/openai';
import axios from 'axios';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { recordLearningEvent } from '../services/evolution-analytics';

export const personalizationChatRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Helper: Execute query on public schema
// Personalization tables (personalization_*, personal_facts) are in public schema
async function query(sql: string, params?: unknown[]) {
  const pool = getPool('personal'); // Use any pool - these tables are in public
  const result = await pool.query(sql, params);
  return result;
}

// ===========================================
// Types
// ===========================================

interface PersonalFact {
  category: string;
  factKey: string;
  factValue: string;
  confidence: number;
}

// Question templates for different topics
const TOPIC_QUESTIONS: Record<string, string[]> = {
  basic_info: [
    'Wie soll ich dich nennen? Hast du einen Spitznamen, den du bevorzugst?',
    'Was machst du beruflich? Erzähl mir ein bisschen von deiner Arbeit.',
    'Wo lebst du? Stadt, Land, oder irgendwo dazwischen?',
  ],
  personality: [
    'Bist du eher introvertiert oder extrovertiert? Wie tankst du Energie auf?',
    'Wie gehst du mit Stress um? Hast du bestimmte Strategien?',
    'Was macht dich richtig glücklich? Die kleinen oder großen Dinge?',
    'Wie würden deine Freunde dich in drei Worten beschreiben?',
  ],
  work_life: [
    'Was motiviert dich bei deiner Arbeit am meisten?',
    'Arbeitest du lieber alleine oder im Team?',
    'Wie sieht dein idealer Arbeitstag aus?',
    'Gibt es etwas an deinem Job, das du gerne ändern würdest?',
  ],
  goals_dreams: [
    'Was ist ein großes Ziel, das du in den nächsten Jahren erreichen möchtest?',
    'Gibt es etwas, das du schon immer lernen wolltest?',
    'Wenn Geld keine Rolle spielen würde, was würdest du tun?',
    'Was bedeutet Erfolg für dich persönlich?',
  ],
  interests_hobbies: [
    'Was machst du gerne in deiner Freizeit?',
    'Gibt es ein Hobby, dem du mehr Zeit widmen möchtest?',
    'Welche Bücher, Podcasts oder Serien begeistern dich?',
    'Reist du gerne? Wohin würdest du am liebsten reisen?',
  ],
  communication_style: [
    'Bevorzugst du kurze, prägnante Antworten oder ausführliche Erklärungen?',
    'Magst du es, wenn ich Emojis verwende?',
    'Soll ich dich duzen oder siezen?',
    'Wie direkt darf ich mit Feedback sein?',
  ],
  decision_making: [
    'Bist du eher ein Kopf- oder Bauchmensch bei Entscheidungen?',
    'Wie lange brauchst du normalerweise für wichtige Entscheidungen?',
    'Holst du dir gerne Rat von anderen oder entscheidest du lieber alleine?',
  ],
  daily_routines: [
    'Bist du eher Frühaufsteher oder Nachteule?',
    'Wann bist du am produktivsten?',
    'Hast du Morgen- oder Abendroutinen, die dir wichtig sind?',
    'Wie planst du deinen Tag - streng getaktet oder flexibel?',
  ],
  values_beliefs: [
    'Was ist dir im Leben am wichtigsten?',
    'Gibt es Prinzipien, nach denen du lebst?',
    'Was bedeutet dir Familie und Freundschaft?',
  ],
  challenges: [
    'Was ist gerade deine größte Herausforderung?',
    'Wobei könnte ich dir am meisten helfen?',
    'Gibt es etwas, das dich regelmäßig frustriert?',
  ],
};

// ===========================================
// Start or Continue Conversation
// ===========================================

/**
 * POST /api/personalization/chat
 * Send a message and get AI response
 * SECURITY: Input validation for message length and session ID format
 */
personalizationChatRouter.post('/chat', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, message } = req.body;

  if (!message) {
    throw new ValidationError('Message is required');
  }

  // Validate message length (prevent excessive storage/memory usage)
  const MAX_MESSAGE_LENGTH = 10000;
  if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
  }

  // Validate session ID format if provided
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (sessionId && !uuidRegex.test(sessionId)) {
    throw new ValidationError('Invalid session ID format. Must be a valid UUID.');
  }

  const currentSessionId = sessionId || uuidv4();

  // Store user message (trim to max length for safety)
  await query(`
    INSERT INTO personalization_conversations (session_id, role, message)
    VALUES ($1, 'user', $2)
  `, [currentSessionId, message.slice(0, MAX_MESSAGE_LENGTH)]);

  // Get conversation history
  const historyResult = await query(`
    SELECT role, message FROM personalization_conversations
    WHERE session_id = $1
    ORDER BY created_at ASC
    LIMIT 20
  `, [currentSessionId]);

  // Get existing facts about user
  const factsResult = await query(`
    SELECT category, fact_key, fact_value FROM personal_facts
    ORDER BY created_at DESC
    LIMIT 30
  `);

  const existingFacts = factsResult.rows.map(r =>
    `${r.category}: ${r.fact_key} = ${r.fact_value}`
  ).join('\n');

  // Extract facts from user message
  const extractedFacts = await extractFactsFromMessage(message, historyResult.rows);

  // Store extracted facts
  for (const fact of extractedFacts) {
    await storeFact(fact, message);
  }

  // Generate AI response
  const aiResponse = await generateAIResponse(
    historyResult.rows,
    existingFacts,
    extractedFacts
  );

  // Store AI response
  await query(`
    INSERT INTO personalization_conversations (session_id, role, message, facts_extracted)
    VALUES ($1, 'ai', $2, $3)
  `, [currentSessionId, aiResponse, JSON.stringify(extractedFacts)]);

  // Record learning event for evolution timeline (non-blocking)
  if (extractedFacts.length > 0) {
    recordLearningEvent('personal', 'profile_enriched',
      `Profil erweitert: ${extractedFacts.length} neue Fakten`, {
        description: extractedFacts.map(f => `${f.category}: ${f.factKey}`).join(', '),
        impact_score: Math.min(0.3 + extractedFacts.length * 0.1, 0.8),
        metadata: { factsCount: extractedFacts.length, sessionId: currentSessionId },
      }
    ).catch(() => {});
  }

  res.json({
    success: true,
    data: {
      sessionId: currentSessionId,
      response: aiResponse,
      factsLearned: extractedFacts.length,
      newFacts: extractedFacts.map(f => ({
        category: f.category,
        key: f.factKey,
        value: f.factValue
      }))
    }
  });
}));

// ===========================================
// Get Initial Question
// ===========================================

/**
 * GET /api/personalization/start
 * Get the first question to start a conversation
 */
personalizationChatRouter.get('/start', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  // Find least explored topic
  const topicResult = await query(`
    SELECT topic, questions_asked, completion_level
    FROM personalization_topics
    ORDER BY completion_level ASC, questions_asked ASC
    LIMIT 1
  `);

  const topic = topicResult.rows[0]?.topic || 'basic_info';
  const question = await getNextQuestion(topic);
  const sessionId = uuidv4();

  // Store the AI's opening message
  const greeting = `Hallo! Ich würde dich gerne besser kennenlernen, damit ich dir noch besser helfen kann.

${question}`;

  await query(`
    INSERT INTO personalization_conversations (session_id, role, message)
    VALUES ($1, 'ai', $2)
  `, [sessionId, greeting]);

  // Update topic stats
  await query(`
    UPDATE personalization_topics
    SET questions_asked = questions_asked + 1, last_asked_at = NOW()
    WHERE topic = $1
  `, [topic]);

  res.json({
    success: true,
    data: {
      sessionId,
      message: greeting,
      currentTopic: topic
    }
  });
}));

// ===========================================
// Get Conversation History
// ===========================================

/**
 * GET /api/personalization/history
 * Load conversation history for a session (or most recent session)
 */
personalizationChatRouter.get('/history', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { session_id } = req.query;

  let result;

  if (session_id && typeof session_id === 'string') {
    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(session_id)) {
      throw new ValidationError('Invalid session_id format');
    }
    result = await query(`
      SELECT role, message, created_at
      FROM personalization_conversations
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [session_id]);
  } else {
    // Load most recent session
    result = await query(`
      SELECT pc.role, pc.message, pc.created_at, pc.session_id
      FROM personalization_conversations pc
      WHERE pc.session_id = (
        SELECT session_id FROM personalization_conversations
        ORDER BY created_at DESC LIMIT 1
      )
      ORDER BY pc.created_at ASC
    `);
  }

  const sessionId = result.rows[0]?.session_id || session_id || null;

  res.json({
    success: true,
    data: {
      session_id: sessionId,
      messages: result.rows.map(r => ({
        role: r.role === 'ai' ? 'assistant' : r.role,
        content: r.message,
        created_at: r.created_at,
      })),
    },
  });
}));

// ===========================================
// Get Learned Facts
// ===========================================

/**
 * GET /api/personalization/facts
 * Get all learned facts about the user
 */
personalizationChatRouter.get('/facts', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.query;

  let queryStr = `
    SELECT id, category, fact_key, fact_value, confidence, source, created_at
    FROM personal_facts
  `;
  const params: string[] = [];

  if (category && typeof category === 'string') {
    queryStr += ` WHERE category = $1`;
    params.push(category);
  }

  queryStr += ` ORDER BY category, created_at DESC`;

  const result = await query(queryStr, params);

  // Group by category
  interface FactItem {
    id: string;
    key: string;
    value: string;
    confidence: number;
    source: string;
    createdAt: Date;
  }
  const factsByCategory: Record<string, FactItem[]> = {};
  for (const row of result.rows) {
    if (!factsByCategory[row.category]) {
      factsByCategory[row.category] = [];
    }
    factsByCategory[row.category].push({
      id: row.id,
      key: row.fact_key,
      value: row.fact_value,
      confidence: parseFloat(row.confidence),
      source: row.source,
      createdAt: row.created_at
    });
  }

  res.json({
    success: true,
    data: {
      factsByCategory,
      totalFacts: result.rows.length
    }
  });
}));

// ===========================================
// Get Learning Progress
// ===========================================

/**
 * GET /api/personalization/progress
 * Get learning progress by topic
 */
personalizationChatRouter.get('/progress', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const topicsResult = await query(`
    SELECT topic, questions_asked, completion_level, last_asked_at
    FROM personalization_topics
    ORDER BY topic
  `);

  const factsCount = await query(`
    SELECT category, COUNT(*) as count
    FROM personal_facts
    GROUP BY category
  `);

  const factsCounts: Record<string, number> = {};
  factsCount.rows.forEach(r => {
    factsCounts[r.category] = parseInt(r.count);
  });

  const topics = topicsResult.rows.map(t => ({
    topic: t.topic,
    label: getTopicLabel(t.topic),
    questionsAsked: t.questions_asked,
    completionLevel: parseFloat(t.completion_level),
    factsLearned: factsCounts[t.topic] || 0,
    lastAskedAt: t.last_asked_at
  }));

  const overallProgress = topics.reduce((sum, t) => sum + t.completionLevel, 0) / topics.length;

  res.json({
    success: true,
    data: {
      topics,
      overallProgress: Math.round(overallProgress * 100),
      totalFactsLearned: Object.values(factsCounts).reduce((a, b) => a + b, 0)
    }
  });
}));

// ===========================================
// Delete Fact
// ===========================================

/**
 * DELETE /api/personalization/facts/:id
 * Delete a specific fact
 * SECURITY: Validates UUID format to prevent injection attacks
 */
personalizationChatRouter.delete('/facts/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError('Invalid fact ID format. Must be a valid UUID.');
  }

  const result = await query('DELETE FROM personal_facts WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Fact');
  }

  res.json({
    success: true,
    message: 'Fact deleted'
  });
}));

// ===========================================
// Get User Summary
// ===========================================

/**
 * GET /api/personalization/summary
 * Get AI-generated summary of what's been learned
 */
personalizationChatRouter.get('/summary', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const factsResult = await query(`
    SELECT category, fact_key, fact_value
    FROM personal_facts
    ORDER BY category, created_at DESC
  `);

  if (factsResult.rows.length === 0) {
    return res.json({
      success: true,
      data: {
        summary: 'Ich kenne dich noch nicht so gut. Lass uns ein Gespräch starten!',
        factCount: 0
      }
    });
  }

  // Generate summary with AI
  const factsText = factsResult.rows.map(r =>
    `${r.category}: ${r.fact_key} = ${r.fact_value}`
  ).join('\n');

  const summary = await generateUserSummary(factsText);

  res.json({
    success: true,
    data: {
      summary,
      factCount: factsResult.rows.length
    }
  });
}));

// ===========================================
// Helper Functions
// ===========================================

async function getNextQuestion(topic: string): Promise<string> {
  const questions = TOPIC_QUESTIONS[topic] || TOPIC_QUESTIONS.basic_info;

  // Get which questions have been asked
  const askedResult = await query(`
    SELECT message FROM personalization_conversations
    WHERE role = 'ai'
    ORDER BY created_at DESC
    LIMIT 50
  `);

  const askedMessages = askedResult.rows.map(r => r.message);

  // Find an unasked question
  for (const question of questions) {
    const alreadyAsked = askedMessages.some(m => m.includes(question));
    if (!alreadyAsked) {
      return question;
    }
  }

  // If all asked, return a follow-up
  return `Erzähl mir mehr über dich. Was liegt dir gerade auf dem Herzen?`;
}

async function extractFactsFromMessage(
  message: string,
  history: { role: string; message: string }[]
): Promise<PersonalFact[]> {
  const lastAiMessage = [...history].reverse().find(m => m.role === 'ai')?.message || '';

  const systemPrompt = `Du bist ein Assistent, der persönliche Fakten aus Gesprächen extrahiert.

Extrahiere alle persönlichen Fakten aus der Antwort. Antworte NUR mit einem JSON-Object mit einem "facts" Array.
Kategorien: basic_info, personality, work_life, goals_dreams, interests_hobbies, communication_style, decision_making, daily_routines, values_beliefs, challenges

Beispiel-Format:
{
  "facts": [
    {"category": "basic_info", "factKey": "name", "factValue": "Max", "confidence": 0.95},
    {"category": "interests_hobbies", "factKey": "hobby", "factValue": "Lesen", "confidence": 0.8}
  ]
}

Wenn keine Fakten extrahiert werden können, antworte mit {"facts": []}.`;

  const userPrompt = `Letzte Frage: "${lastAiMessage}"
Benutzer-Antwort: "${message}"`;

  // Try OpenAI first
  if (isOpenAIAvailable()) {
    try {
      logger.info('Extracting facts with OpenAI');
      const response = await generateOpenAIResponse(systemPrompt, userPrompt);
      const parsed = JSON.parse(response);
      const facts = parsed.facts || [];
      return facts.filter((f: Partial<PersonalFact>) =>
        f.category && f.factKey && f.factValue && f.confidence
      );
    } catch (error) {
      logger.warn('OpenAI fact extraction failed, trying Ollama', { error });
    }
  }

  // Fallback to Ollama
  try {
    logger.info('Extracting facts with Ollama');
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: 'mistral:latest',
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        options: { temperature: 0.3, num_predict: 500 }
      },
      { timeout: 30000 }
    );

    const text = response.data.response;
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const facts = parsed.facts || [];
      return facts.filter((f: Partial<PersonalFact>) =>
        f.category && f.factKey && f.factValue && f.confidence
      );
    }
  } catch (error) {
    logger.warn('Ollama fact extraction failed', { error });
  }

  return [];
}

async function storeFact(fact: PersonalFact, userResponse: string): Promise<void> {
  await query(`
    INSERT INTO personal_facts (category, fact_key, fact_value, confidence, user_response)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (category, fact_key)
    DO UPDATE SET
      fact_value = EXCLUDED.fact_value,
      confidence = GREATEST(personal_facts.confidence, EXCLUDED.confidence),
      user_response = EXCLUDED.user_response,
      updated_at = NOW()
  `, [fact.category, fact.factKey, fact.factValue, fact.confidence, userResponse]);

  // Update topic completion
  const factsInCategory = await query(`
    SELECT COUNT(*) FROM personal_facts WHERE category = $1
  `, [fact.category]);

  const count = parseInt(factsInCategory.rows[0].count);
  const completion = Math.min(1.0, count / 5); // 5 facts = complete

  await query(`
    UPDATE personalization_topics
    SET completion_level = $2
    WHERE topic = $1
  `, [fact.category, completion]);
}

async function generateAIResponse(
  history: { role: string; message: string }[],
  existingFacts: string,
  newFacts: PersonalFact[]
): Promise<string> {
  // Find next topic to explore
  const topicResult = await query(`
    SELECT topic, completion_level
    FROM personalization_topics
    WHERE completion_level < 1.0
    ORDER BY completion_level ASC, RANDOM()
    LIMIT 1
  `);

  const nextTopic = topicResult.rows[0]?.topic || 'interests_hobbies';
  const nextQuestion = await getNextQuestion(nextTopic);

  const conversationHistory = history.slice(-6).map(m =>
    `${m.role === 'ai' ? 'KI' : 'Benutzer'}: ${m.message}`
  ).join('\n');

  const systemPrompt = `Du bist eine freundliche, einfühlsame KI, die einen Menschen besser kennenlernen möchte.
Du führst ein natürliches Gespräch und stellst am Ende eine neue Frage.

Antworte natürlich und warmherzig auf das Gesagte. Zeige echtes Interesse.
Baue die nächste Frage geschickt ein. Halte dich kurz (2-3 Sätze + Frage).
Sprich Deutsch und duze den Benutzer.`;

  const userPrompt = `Was du über den Benutzer weißt:
${existingFacts || 'Noch nicht viel'}

${newFacts.length > 0 ? `Gerade gelernt: ${newFacts.map(f => f.factValue).join(', ')}` : ''}

Bisheriges Gespräch:
${conversationHistory}

Nächste Frage die du stellen solltest (zum Thema ${getTopicLabel(nextTopic)}):
"${nextQuestion}"`;

  // Try OpenAI first
  if (isOpenAIAvailable()) {
    try {
      logger.info('Generating AI response with OpenAI');
      const response = await generateOpenAIResponse(systemPrompt, userPrompt);

      // Update topic stats
      await query(`
        UPDATE personalization_topics
        SET questions_asked = questions_asked + 1, last_asked_at = NOW()
        WHERE topic = $1
      `, [nextTopic]);

      return response;
    } catch (error) {
      logger.warn('OpenAI response generation failed, trying Ollama', { error });
    }
  }

  // Fallback to Ollama
  try {
    logger.info('Generating AI response with Ollama');
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: 'mistral:latest',
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        options: { temperature: 0.8, num_predict: 300 }
      },
      { timeout: 45000 }
    );

    // Update topic stats
    await query(`
      UPDATE personalization_topics
      SET questions_asked = questions_asked + 1, last_asked_at = NOW()
      WHERE topic = $1
    `, [nextTopic]);

    return response.data.response.trim();
  } catch (error) {
    logger.error('AI response generation failed', error instanceof Error ? error : undefined);
    return `Das ist interessant! ${nextQuestion}`;
  }
}

async function generateUserSummary(factsText: string): Promise<string> {
  const systemPrompt = `Basierend auf diesen Fakten über einen Benutzer, schreibe eine kurze, freundliche Zusammenfassung (3-4 Sätze) in der ersten Person, als würdest du den Benutzer beschreiben. Schreibe auf Deutsch, warmherzig und persönlich.`;

  const userPrompt = `Fakten:
${factsText}`;

  // Try OpenAI first
  if (isOpenAIAvailable()) {
    try {
      logger.info('Generating user summary with OpenAI');
      return await generateOpenAIResponse(systemPrompt, userPrompt);
    } catch (error) {
      logger.warn('OpenAI summary generation failed, trying Ollama', { error });
    }
  }

  // Fallback to Ollama
  try {
    logger.info('Generating user summary with Ollama');
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: 'mistral:latest',
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        options: { temperature: 0.7, num_predict: 200 }
      },
      { timeout: 30000 }
    );

    return response.data.response.trim();
  } catch {
    return 'Ich lerne dich gerade kennen und freue mich auf unsere Gespräche!';
  }
}

function getTopicLabel(topic: string): string {
  const labels: Record<string, string> = {
    basic_info: 'Grundlegendes',
    personality: 'Persönlichkeit',
    work_life: 'Arbeit & Beruf',
    goals_dreams: 'Ziele & Träume',
    interests_hobbies: 'Interessen & Hobbys',
    communication_style: 'Kommunikationsstil',
    decision_making: 'Entscheidungsfindung',
    daily_routines: 'Tagesablauf',
    values_beliefs: 'Werte & Überzeugungen',
    challenges: 'Herausforderungen'
  };
  return labels[topic] || topic;
}
