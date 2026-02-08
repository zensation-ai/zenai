/**
 * Structured Extraction Service
 *
 * Extracts structured knowledge from voice transcriptions:
 * - Core ideas (max 3)
 * - Action items with deadline detection
 * - Mentioned people/projects
 * - Mood/context
 * - Auto-linking to existing ideas
 *
 * Phase 32E: Voice-to-Structured-Knowledge Pipeline
 *
 * @module services/structured-extraction
 */

import { logger } from '../utils/logger';
import { AIContext } from '../utils/database-context';
import { getClaudeClient, CLAUDE_MODEL, executeWithProtection } from './claude/client';
import { enhancedRAG } from './enhanced-rag';

// ===========================================
// Types
// ===========================================

export interface ExtractionResult {
  /** Core ideas extracted (max 3) */
  coreIdeas: CoreIdea[];
  /** Action items with optional deadlines */
  actionItems: ActionItem[];
  /** Mentioned entities (people, projects, tools) */
  mentions: Mention[];
  /** Overall mood/intent of the transcription */
  mood: MoodInfo;
  /** Potential links to existing ideas */
  suggestedLinks: SuggestedLink[];
}

export interface CoreIdea {
  title: string;
  summary: string;
  category: 'business' | 'technical' | 'personal' | 'learning';
  confidence: number;
}

export interface ActionItem {
  description: string;
  deadline?: string; // ISO date or relative like "next week"
  priority: 'high' | 'medium' | 'low';
  assignee?: string;
}

export interface Mention {
  name: string;
  type: 'person' | 'project' | 'tool' | 'company';
  context: string;
}

export interface MoodInfo {
  primary: 'exploratory' | 'decisive' | 'reflective' | 'urgent' | 'creative' | 'analytical';
  confidence: number;
}

export interface SuggestedLink {
  existingIdeaId: string;
  existingIdeaTitle: string;
  reason: string;
  similarity: number;
}

// ===========================================
// Core Extraction
// ===========================================

/**
 * Extract structured knowledge from a voice transcription.
 */
export async function extractStructuredKnowledge(
  transcript: string,
  context: AIContext,
  options: { enableAutoLinking?: boolean } = {}
): Promise<ExtractionResult> {
  const { enableAutoLinking = true } = options;
  const startTime = Date.now();

  logger.info('Structured extraction starting', {
    transcriptLength: transcript.length,
    context,
    enableAutoLinking,
  });

  // Step 1: Claude extraction
  const extraction = await extractViaClaude(transcript);

  // Step 2: Auto-linking (find similar existing ideas)
  let suggestedLinks: SuggestedLink[] = [];
  if (enableAutoLinking && extraction.coreIdeas.length > 0) {
    suggestedLinks = await findSimilarIdeas(extraction.coreIdeas, context);
  }

  logger.info('Structured extraction complete', {
    coreIdeas: extraction.coreIdeas.length,
    actionItems: extraction.actionItems.length,
    mentions: extraction.mentions.length,
    suggestedLinks: suggestedLinks.length,
    timeMs: Date.now() - startTime,
  });

  return {
    ...extraction,
    suggestedLinks,
  };
}

// ===========================================
// Claude Extraction
// ===========================================

async function extractViaClaude(transcript: string): Promise<Omit<ExtractionResult, 'suggestedLinks'>> {
  const systemPrompt = `Du bist ein Wissensextraktor. Analysiere die folgende Sprachnotiz-Transkription und extrahiere strukturiertes Wissen.

Antworte AUSSCHLIESSLICH mit validem JSON in diesem Format:
{
  "coreIdeas": [
    { "title": "Kurzer Titel", "summary": "1-2 Sätze", "category": "business|technical|personal|learning", "confidence": 0.0-1.0 }
  ],
  "actionItems": [
    { "description": "Was zu tun ist", "deadline": "ISO-Datum oder null", "priority": "high|medium|low", "assignee": "Name oder null" }
  ],
  "mentions": [
    { "name": "Name", "type": "person|project|tool|company", "context": "Kurzer Kontext" }
  ],
  "mood": { "primary": "exploratory|decisive|reflective|urgent|creative|analytical", "confidence": 0.0-1.0 }
}

Regeln:
- Maximal 3 Kernideen
- Nur echte Action Items (keine vagen Absichten)
- Deadlines nur wenn explizit erwähnt oder klar ableitbar
- Mood basiert auf Tonfall und Inhalt der Transkription
- Bei kurzen/unklaren Transkriptionen: weniger extrahieren, höhere confidence-Schwelle`;

  try {
    const client = getClaudeClient();
    const response = await executeWithProtection(() =>
      client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Transkription:\n\n${transcript}` }],
      })
    );

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Structured extraction: no JSON found in response');
      return getEmptyResult();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      coreIdeas: validateCoreIdeas(parsed.coreIdeas || []),
      actionItems: validateActionItems(parsed.actionItems || []),
      mentions: validateMentions(parsed.mentions || []),
      mood: validateMood(parsed.mood),
    };
  } catch (error) {
    logger.error('Structured extraction via Claude failed', error instanceof Error ? error : undefined);
    return getEmptyResult();
  }
}

// ===========================================
// Auto-Linking
// ===========================================

async function findSimilarIdeas(
  coreIdeas: CoreIdea[],
  context: AIContext
): Promise<SuggestedLink[]> {
  const links: SuggestedLink[] = [];
  const seenIds = new Set<string>();

  try {
    // Search for each core idea
    for (const idea of coreIdeas.slice(0, 3)) {
      const results = await enhancedRAG.quickRetrieve(
        `${idea.title} ${idea.summary}`,
        context,
        3
      );

      for (const result of results) {
        if (seenIds.has(result.id)) continue;
        if (result.score < 0.5) continue;

        seenIds.add(result.id);
        links.push({
          existingIdeaId: result.id,
          existingIdeaTitle: result.title,
          reason: `Ähnlich zu "${idea.title}"`,
          similarity: result.score,
        });
      }
    }
  } catch (error) {
    logger.debug('Auto-linking in structured extraction failed', { error });
  }

  return links.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

// ===========================================
// Validation Helpers
// ===========================================

function validateCoreIdeas(ideas: unknown[]): CoreIdea[] {
  if (!Array.isArray(ideas)) return [];
  return ideas
    .filter((i): i is CoreIdea =>
      typeof i === 'object' && i !== null &&
      typeof (i as CoreIdea).title === 'string' &&
      typeof (i as CoreIdea).summary === 'string'
    )
    .map(i => ({
      title: i.title.substring(0, 200),
      summary: i.summary.substring(0, 500),
      category: ['business', 'technical', 'personal', 'learning'].includes(i.category) ? i.category : 'personal',
      confidence: typeof i.confidence === 'number' ? Math.max(0, Math.min(1, i.confidence)) : 0.5,
    }))
    .slice(0, 3);
}

function validateActionItems(items: unknown[]): ActionItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is ActionItem =>
      typeof i === 'object' && i !== null &&
      typeof (i as ActionItem).description === 'string'
    )
    .map(i => ({
      description: i.description.substring(0, 300),
      deadline: typeof i.deadline === 'string' ? i.deadline : undefined,
      priority: ['high', 'medium', 'low'].includes(i.priority) ? i.priority : 'medium',
      assignee: typeof i.assignee === 'string' ? i.assignee.substring(0, 100) : undefined,
    }))
    .slice(0, 5);
}

function validateMentions(mentions: unknown[]): Mention[] {
  if (!Array.isArray(mentions)) return [];
  return mentions
    .filter((m): m is Mention =>
      typeof m === 'object' && m !== null &&
      typeof (m as Mention).name === 'string'
    )
    .map(m => ({
      name: m.name.substring(0, 100),
      type: ['person', 'project', 'tool', 'company'].includes(m.type) ? m.type : 'person',
      context: typeof m.context === 'string' ? m.context.substring(0, 200) : '',
    }))
    .slice(0, 10);
}

function validateMood(mood: unknown): MoodInfo {
  const validMoods = ['exploratory', 'decisive', 'reflective', 'urgent', 'creative', 'analytical'];
  if (typeof mood === 'object' && mood !== null) {
    const m = mood as MoodInfo;
    return {
      primary: validMoods.includes(m.primary) ? m.primary : 'exploratory',
      confidence: typeof m.confidence === 'number' ? Math.max(0, Math.min(1, m.confidence)) : 0.5,
    };
  }
  return { primary: 'exploratory', confidence: 0.3 };
}

function getEmptyResult(): Omit<ExtractionResult, 'suggestedLinks'> {
  return {
    coreIdeas: [],
    actionItems: [],
    mentions: [],
    mood: { primary: 'exploratory', confidence: 0.3 },
  };
}
