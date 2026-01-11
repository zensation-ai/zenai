/**
 * Business Profile Learning Service
 *
 * Lernt kontinuierlich über den Nutzer und sein Business:
 * - Analysiert Ideen und Aufgaben für Muster
 * - Erkennt wiederkehrende Themen und Technologien
 * - Aktualisiert Präferenzen basierend auf Verhalten
 * - Generiert personalisierte Kontexte für KI-Prompts
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { queryOllamaJSON, generateEmbedding } from '../utils/ollama';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface BusinessProfile {
  id: string;
  context: AIContext;
  user_id: string;
  company_name: string | null;
  industry: string | null;
  company_size: string | null;
  role: string | null;
  main_products_services: string[];
  target_customers: string[];
  key_partners: string[];
  tech_stack: string[];
  communication_style: string | null;
  decision_making_style: string | null;
  preferred_meeting_types: string[];
  recurring_topics: Record<string, number>;
  pain_points: string[];
  goals: string[];
  learned_patterns: Record<string, unknown>;
  personality_traits: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsight {
  category: string;
  insight: string;
  confidence: number;
  source: string;
}

export interface LearningResult {
  profile_updated: boolean;
  new_insights: ProfileInsight[];
  topics_updated: string[];
  patterns_found: string[];
}

// ===========================================
// Profile Management
// ===========================================

/**
 * Holt oder erstellt ein Business-Profil
 */
export async function getOrCreateProfile(
  context: AIContext = 'personal',
  userId: string = 'default'
): Promise<BusinessProfile> {
  // Versuche existierendes Profil zu laden
  const existing = await queryContext(
    context,
    `SELECT * FROM business_profile WHERE context = $1 AND user_id = $2`,
    [context, userId]
  );

  if (existing.rows.length > 0) {
    return formatProfile(existing.rows[0]);
  }

  // Erstelle neues Profil
  const id = uuidv4();
  await queryContext(
    context,
    `INSERT INTO business_profile (id, context, user_id) VALUES ($1, $2, $3)`,
    [id, context, userId]
  );

  logger.info('Created new business profile', { context, userId });

  return {
    id,
    context,
    user_id: userId,
    company_name: null,
    industry: null,
    company_size: null,
    role: null,
    main_products_services: [],
    target_customers: [],
    key_partners: [],
    tech_stack: [],
    communication_style: null,
    decision_making_style: null,
    preferred_meeting_types: [],
    recurring_topics: {},
    pain_points: [],
    goals: [],
    learned_patterns: {},
    personality_traits: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Aktualisiert das Business-Profil
 */
export async function updateProfile(
  context: AIContext,
  updates: Partial<Omit<BusinessProfile, 'id' | 'context' | 'user_id' | 'created_at' | 'updated_at'>>,
  userId: string = 'default'
): Promise<BusinessProfile> {
  const profile = await getOrCreateProfile(context, userId);

  const fieldsToUpdate: string[] = [];
  const values: (string | number | boolean | null | string[])[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, string> = {
    company_name: 'company_name',
    industry: 'industry',
    company_size: 'company_size',
    role: 'role',
    main_products_services: 'main_products_services',
    target_customers: 'target_customers',
    key_partners: 'key_partners',
    tech_stack: 'tech_stack',
    communication_style: 'communication_style',
    decision_making_style: 'decision_making_style',
    preferred_meeting_types: 'preferred_meeting_types',
    recurring_topics: 'recurring_topics',
    pain_points: 'pain_points',
    goals: 'goals',
    learned_patterns: 'learned_patterns',
    personality_traits: 'personality_traits',
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (key in updates) {
      const value = updates[key as keyof typeof updates];
      if (value === undefined) continue;

      fieldsToUpdate.push(`${dbField} = $${paramIndex++}`);
      // JSON-Felder müssen stringifiziert werden
      if (typeof value === 'object' && !Array.isArray(value)) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value as string | number | boolean | null | string[]);
      }
    }
  }

  if (fieldsToUpdate.length === 0) {
    return profile;
  }

  fieldsToUpdate.push(`updated_at = NOW()`);
  values.push(profile.id);

  await queryContext(
    context,
    `UPDATE business_profile SET ${fieldsToUpdate.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  logger.info('Updated business profile', { context, userId, fieldsUpdated: fieldsToUpdate.length });

  return getOrCreateProfile(context, userId);
}

// ===========================================
// Learning from Ideas
// ===========================================

/**
 * Lernt aus einer neuen Idee/Aufgabe
 */
export async function learnFromIdea(
  ideaId: string,
  title: string,
  content: string,
  type: string,
  category: string,
  keywords: string[],
  context: AIContext = 'personal'
): Promise<LearningResult> {
  const result: LearningResult = {
    profile_updated: false,
    new_insights: [],
    topics_updated: [],
    patterns_found: [],
  };

  try {
    const profile = await getOrCreateProfile(context);

    // 1. Aktualisiere recurring_topics
    const updatedTopics = { ...profile.recurring_topics };
    for (const keyword of keywords) {
      const normalizedKw = keyword.toLowerCase().trim();
      if (normalizedKw.length > 2) {
        updatedTopics[normalizedKw] = (updatedTopics[normalizedKw] || 0) + 1;
        result.topics_updated.push(normalizedKw);
      }
    }

    // Kategorie auch tracken
    updatedTopics[category] = (updatedTopics[category] || 0) + 1;

    // 2. Extrahiere Tech-Stack aus dem Inhalt
    const techKeywords = extractTechStack(content);
    let techStackUpdated = false;
    const currentTechStack = [...profile.tech_stack];

    for (const tech of techKeywords) {
      if (!currentTechStack.includes(tech)) {
        currentTechStack.push(tech);
        techStackUpdated = true;
        result.new_insights.push({
          category: 'tech_stack',
          insight: `Neue Technologie erkannt: ${tech}`,
          confidence: 0.7,
          source: ideaId,
        });
      }
    }

    // 3. Erkenne Pain Points und Goals
    const { painPoints, goals } = await extractPainPointsAndGoals(title, content, type);

    let painPointsUpdated = false;
    const currentPainPoints = [...profile.pain_points];
    for (const pp of painPoints) {
      if (!currentPainPoints.some(p => p.toLowerCase().includes(pp.toLowerCase()))) {
        currentPainPoints.push(pp);
        painPointsUpdated = true;
        result.new_insights.push({
          category: 'pain_point',
          insight: pp,
          confidence: 0.6,
          source: ideaId,
        });
      }
    }

    let goalsUpdated = false;
    const currentGoals = [...profile.goals];
    for (const goal of goals) {
      if (!currentGoals.some(g => g.toLowerCase().includes(goal.toLowerCase()))) {
        currentGoals.push(goal);
        goalsUpdated = true;
        result.new_insights.push({
          category: 'goal',
          insight: goal,
          confidence: 0.6,
          source: ideaId,
        });
      }
    }

    // 4. Aktualisiere Patterns
    const patterns = { ...profile.learned_patterns } as Record<string, unknown>;

    // Zeitliche Muster
    const hour = new Date().getHours();
    const timeSlot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const timePatterns = (patterns.time_patterns || {}) as Record<string, number>;
    timePatterns[timeSlot] = (timePatterns[timeSlot] || 0) + 1;
    patterns.time_patterns = timePatterns;

    // Typ-Präferenzen
    const typePrefs = (patterns.type_preferences || {}) as Record<string, number>;
    typePrefs[type] = (typePrefs[type] || 0) + 1;
    patterns.type_preferences = typePrefs;

    result.patterns_found.push(`${timeSlot}_activity`, `type_${type}`);

    // 5. Speichere Updates
    const updates: Partial<BusinessProfile> = {
      recurring_topics: updatedTopics,
      learned_patterns: patterns,
    };

    if (techStackUpdated) {
      updates.tech_stack = currentTechStack.slice(0, 20); // Max 20 Technologien
    }
    if (painPointsUpdated) {
      updates.pain_points = currentPainPoints.slice(-10); // Letzte 10
    }
    if (goalsUpdated) {
      updates.goals = currentGoals.slice(-10); // Letzte 10
    }

    await updateProfile(context, updates);
    result.profile_updated = true;

    logger.debug('Learned from idea', {
      ideaId,
      topicsUpdated: result.topics_updated.length,
      insightsFound: result.new_insights.length,
    });

  } catch (error) {
    logger.warn('Could not learn from idea', { ideaId });
  }

  return result;
}

/**
 * Extrahiert Tech-Stack aus Text
 */
function extractTechStack(text: string): string[] {
  const techPatterns = [
    // Programmiersprachen
    /\b(TypeScript|JavaScript|Python|Java|C\+\+|C#|Go|Rust|PHP|Ruby|Swift|Kotlin)\b/gi,
    // Frameworks
    /\b(React|Angular|Vue|Next\.js|Express|Django|Flask|Spring|Laravel|Rails)\b/gi,
    // Datenbanken
    /\b(PostgreSQL|MySQL|MongoDB|Redis|SQLite|Supabase|Firebase)\b/gi,
    // Cloud/Infra
    /\b(AWS|Azure|GCP|Docker|Kubernetes|Railway|Vercel|Netlify)\b/gi,
    // Tools
    /\b(Git|GitHub|GitLab|Jira|Confluence|Slack|Teams)\b/gi,
    // Enterprise
    /\b(SAP|Salesforce|Oracle|Microsoft 365|SharePoint)\b/gi,
    // AI/ML
    /\b(Ollama|OpenAI|Claude|GPT|LLM|RAG|TensorFlow|PyTorch)\b/gi,
  ];

  const found = new Set<string>();

  for (const pattern of techPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => found.add(m));
    }
  }

  return Array.from(found);
}

/**
 * Extrahiert Pain Points und Ziele mit LLM
 */
async function extractPainPointsAndGoals(
  title: string,
  content: string,
  type: string
): Promise<{ painPoints: string[]; goals: string[] }> {
  // Nur bei bestimmten Typen analysieren
  if (!['task', 'idea', 'problem'].includes(type)) {
    return { painPoints: [], goals: [] };
  }

  try {
    const prompt = `Analysiere diese Notiz und extrahiere Pain Points (Probleme/Herausforderungen) und Ziele.

Titel: ${title}
Inhalt: ${content}
Typ: ${type}

Antworte im JSON-Format:
{
  "pain_points": ["Kurze Beschreibung eines Problems"],
  "goals": ["Kurze Beschreibung eines Ziels"]
}

Regeln:
- Nur echte Pain Points und Ziele extrahieren (keine generischen)
- Maximal 2 von jedem
- Leere Arrays wenn nichts Relevantes gefunden
- Auf Deutsch antworten`;

    const result = await queryOllamaJSON<{
      pain_points?: string[];
      goals?: string[];
    }>(prompt);

    return {
      painPoints: result?.pain_points || [],
      goals: result?.goals || [],
    };
  } catch (error) {
    return { painPoints: [], goals: [] };
  }
}

// ===========================================
// Batch Learning
// ===========================================

/**
 * Analysiert alle Ideen und aktualisiert das Profil umfassend
 */
export async function runComprehensiveProfileAnalysis(
  context: AIContext = 'personal',
  daysBack: number = 30
): Promise<{
  ideas_analyzed: number;
  profile_updates: string[];
  new_insights: ProfileInsight[];
}> {
  const result = {
    ideas_analyzed: 0,
    profile_updates: [] as string[],
    new_insights: [] as ProfileInsight[],
  };

  try {
    // Hole Ideen der letzten X Tage
    // Sichere Parameterisierung: daysBack wird validiert und als Integer übergeben
    const safeDaysBack = Math.max(1, Math.min(365, Math.floor(Number(daysBack) || 30)));
    const ideasResult = await queryContext(
      context,
      `SELECT id, title, summary, type, category, keywords
       FROM ideas
       WHERE created_at >= NOW() - make_interval(days => $1)
       ORDER BY created_at DESC
       LIMIT 100`,
      [safeDaysBack]
    );

    result.ideas_analyzed = ideasResult.rows.length;

    if (ideasResult.rows.length === 0) {
      return result;
    }

    const profile = await getOrCreateProfile(context);

    // Sammle alle Daten
    const allKeywords: string[] = [];
    const allContent: string[] = [];
    const typeCount: Record<string, number> = {};
    const categoryCount: Record<string, number> = {};

    for (const idea of ideasResult.rows) {
      const keywords = Array.isArray(idea.keywords)
        ? idea.keywords
        : JSON.parse(idea.keywords || '[]');

      allKeywords.push(...keywords);
      allContent.push(`${idea.title} ${idea.summary || ''}`);

      typeCount[idea.type] = (typeCount[idea.type] || 0) + 1;
      categoryCount[idea.category] = (categoryCount[idea.category] || 0) + 1;
    }

    // Analysiere mit LLM
    const analysisPrompt = `Analysiere diese gesammelten Notizen eines Nutzers und erstelle ein Profil.

Häufige Keywords: ${[...new Set(allKeywords)].slice(0, 30).join(', ')}

Kategorien: ${Object.entries(categoryCount).map(([k, v]) => `${k}: ${v}`).join(', ')}
Typen: ${Object.entries(typeCount).map(([k, v]) => `${k}: ${v}`).join(', ')}

Beispiel-Inhalte (erste 5):
${allContent.slice(0, 5).map((c, i) => `${i + 1}. ${c.substring(0, 200)}`).join('\n')}

Erstelle ein JSON-Profil:
{
  "industry": "Vermutete Branche oder null",
  "role": "Vermutete Rolle des Nutzers oder null",
  "main_focus_areas": ["Hauptthema 1", "Hauptthema 2"],
  "communication_style": "formal|casual|mixed oder null",
  "work_style_insights": ["Erkenntnis über Arbeitsweise"],
  "suggested_focus_topics": ["Thema das die KI priorisieren sollte"]
}

Basiere alles auf den tatsächlichen Daten. Bei Unsicherheit null setzen.`;

    const analysis = await queryOllamaJSON<{
      industry?: string;
      role?: string;
      main_focus_areas?: string[];
      communication_style?: string;
      work_style_insights?: string[];
      suggested_focus_topics?: string[];
    }>(analysisPrompt);

    if (analysis) {
      const updates: Partial<BusinessProfile> = {};

      if (analysis.industry && !profile.industry) {
        updates.industry = analysis.industry;
        result.profile_updates.push(`Branche: ${analysis.industry}`);
      }

      if (analysis.role && !profile.role) {
        updates.role = analysis.role;
        result.profile_updates.push(`Rolle: ${analysis.role}`);
      }

      if (analysis.communication_style && !profile.communication_style) {
        updates.communication_style = analysis.communication_style;
        result.profile_updates.push(`Kommunikationsstil: ${analysis.communication_style}`);
      }

      // Work Style Insights zu Patterns hinzufügen
      if (analysis.work_style_insights && analysis.work_style_insights.length > 0) {
        const patterns = { ...profile.learned_patterns } as Record<string, unknown>;
        patterns.work_style_insights = analysis.work_style_insights;
        updates.learned_patterns = patterns;

        for (const insight of analysis.work_style_insights) {
          result.new_insights.push({
            category: 'work_style',
            insight,
            confidence: 0.7,
            source: 'comprehensive_analysis',
          });
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateProfile(context, updates);
      }
    }

    logger.info('Comprehensive profile analysis completed', {
      context,
      ideasAnalyzed: result.ideas_analyzed,
      updatesCount: result.profile_updates.length,
    });

  } catch (error) {
    logger.error('Profile analysis failed', error instanceof Error ? error : undefined);
  }

  return result;
}

// ===========================================
// Context Generation
// ===========================================

/**
 * Generiert personalisierten Kontext für LLM-Prompts
 */
export async function getPersonalizedContext(
  context: AIContext = 'personal'
): Promise<string> {
  try {
    const profile = await getOrCreateProfile(context);

    const parts: string[] = [];

    if (profile.role) {
      parts.push(`Der Nutzer arbeitet als ${profile.role}.`);
    }

    if (profile.industry) {
      parts.push(`Branche: ${profile.industry}.`);
    }

    if (profile.tech_stack.length > 0) {
      parts.push(`Bekannte Technologien: ${profile.tech_stack.slice(0, 10).join(', ')}.`);
    }

    // Top 5 recurring topics
    const topTopics = Object.entries(profile.recurring_topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    if (topTopics.length > 0) {
      parts.push(`Häufige Themen: ${topTopics.join(', ')}.`);
    }

    if (profile.goals.length > 0) {
      parts.push(`Aktuelle Ziele: ${profile.goals.slice(0, 3).join('; ')}.`);
    }

    if (profile.pain_points.length > 0) {
      parts.push(`Bekannte Herausforderungen: ${profile.pain_points.slice(0, 3).join('; ')}.`);
    }

    if (profile.communication_style) {
      parts.push(`Bevorzugter Stil: ${profile.communication_style}.`);
    }

    if (parts.length === 0) {
      return '';
    }

    return `\n\n[Nutzer-Kontext]\n${parts.join('\n')}`;
  } catch (error) {
    return '';
  }
}

/**
 * Holt Profil-Statistiken für das Dashboard
 */
export async function getProfileStats(
  context: AIContext = 'personal'
): Promise<{
  profile_completeness: number;
  topics_tracked: number;
  top_topics: Array<{ topic: string; count: number }>;
  tech_stack_count: number;
  insights_count: number;
  last_updated: string | null;
}> {
  try {
    const profile = await getOrCreateProfile(context);

    // Berechne Vollständigkeit
    const fields = [
      profile.company_name,
      profile.industry,
      profile.role,
      profile.main_products_services.length > 0,
      profile.tech_stack.length > 0,
      profile.communication_style,
      profile.goals.length > 0,
    ];
    const completeness = fields.filter(Boolean).length / fields.length;

    // Top Topics
    const topTopics = Object.entries(profile.recurring_topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));

    // Insights zählen
    const patterns = profile.learned_patterns as Record<string, unknown>;
    const insightsCount =
      (profile.pain_points.length) +
      (profile.goals.length) +
      ((patterns.work_style_insights as string[] || []).length);

    return {
      profile_completeness: Math.round(completeness * 100),
      topics_tracked: Object.keys(profile.recurring_topics).length,
      top_topics: topTopics,
      tech_stack_count: profile.tech_stack.length,
      insights_count: insightsCount,
      last_updated: profile.updated_at,
    };
  } catch (error) {
    return {
      profile_completeness: 0,
      topics_tracked: 0,
      top_topics: [],
      tech_stack_count: 0,
      insights_count: 0,
      last_updated: null,
    };
  }
}

// ===========================================
// Helpers
// ===========================================

function formatProfile(row: Record<string, unknown>): BusinessProfile {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    user_id: row.user_id as string,
    company_name: row.company_name as string | null,
    industry: row.industry as string | null,
    company_size: row.company_size as string | null,
    role: row.role as string | null,
    main_products_services: (row.main_products_services as string[]) || [],
    target_customers: (row.target_customers as string[]) || [],
    key_partners: (row.key_partners as string[]) || [],
    tech_stack: (row.tech_stack as string[]) || [],
    communication_style: row.communication_style as string | null,
    decision_making_style: row.decision_making_style as string | null,
    preferred_meeting_types: (row.preferred_meeting_types as string[]) || [],
    recurring_topics: (row.recurring_topics as Record<string, number>) || {},
    pain_points: (row.pain_points as string[]) || [],
    goals: (row.goals as string[]) || [],
    learned_patterns: (row.learned_patterns as Record<string, unknown>) || {},
    personality_traits: (row.personality_traits as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
