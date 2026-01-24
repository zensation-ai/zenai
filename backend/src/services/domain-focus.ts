/**
 * Domain Focus Service
 *
 * Ermöglicht dem Nutzer, der KI mitzuteilen, auf welche Themen
 * sie sich konzentrieren soll. Die KI lernt dann gezielt in diesen
 * Bereichen und gibt kontextbezogenere Antworten.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface DomainFocus {
  id: string;
  context: AIContext;
  name: string;
  description: string | null;
  keywords: string[];
  document_sources: DocumentSource[];
  api_connections: APIConnection[];
  learning_goals: string[];
  is_active: boolean;
  priority: number;
  ideas_count: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentSource {
  type: 'url' | 'file' | 'wiki' | 'api_doc';
  path: string;
  name?: string;
  last_synced?: string;
}

export interface APIConnection {
  provider: string;
  type: 'read' | 'write' | 'sync';
  schedule?: string;
  last_run?: string;
  status?: 'active' | 'error' | 'pending';
}

export interface CreateDomainFocusInput {
  name: string;
  description?: string;
  keywords?: string[];
  learning_goals?: string[];
  document_sources?: DocumentSource[];
  api_connections?: APIConnection[];
  priority?: number;
}

// ===========================================
// Domain Focus Management
// ===========================================

/**
 * Erstellt einen neuen Domain Focus
 */
export async function createDomainFocus(
  input: CreateDomainFocusInput,
  context: AIContext = 'personal'
): Promise<DomainFocus> {
  const id = uuidv4();

  // Generiere Embedding für semantische Suche
  const focusText = `${input.name} ${input.description || ''} ${(input.keywords || []).join(' ')}`;
  let embedding: number[] | null = null;

  try {
    embedding = await generateEmbedding(focusText);
  } catch (error) {
    logger.warn('Could not generate focus embedding', { error });
  }

  const result = await queryContext(
    context,
    `INSERT INTO domain_focus
      (id, context, name, description, keywords, learning_goals,
       document_sources, api_connections, priority, focus_embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      context,
      input.name,
      input.description || null,
      input.keywords || [],
      input.learning_goals || [],
      JSON.stringify(input.document_sources || []),
      JSON.stringify(input.api_connections || []),
      input.priority || 5,
      embedding ? `[${embedding.join(',')}]` : null,
    ]
  );

  logger.info('Domain focus created', { id, name: input.name, context });

  return formatDomainFocus(result.rows[0]);
}

/**
 * Aktualisiert einen Domain Focus
 */
export async function updateDomainFocus(
  id: string,
  updates: Partial<CreateDomainFocusInput>,
  context: AIContext = 'personal'
): Promise<DomainFocus | null> {
  // Hole existierenden Focus
  const existing = await getDomainFocus(id, context);
  if (!existing) {return null;}

  // Generiere neues Embedding wenn Name/Description/Keywords geändert
  let embedding: number[] | null = null;
  if (updates.name || updates.description || updates.keywords) {
    const focusText = `${updates.name || existing.name} ${updates.description || existing.description || ''} ${(updates.keywords || existing.keywords).join(' ')}`;
    try {
      embedding = await generateEmbedding(focusText);
    } catch (error) {
      logger.warn('Could not update focus embedding', { error });
    }
  }

  const result = await queryContext(
    context,
    `UPDATE domain_focus SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      keywords = COALESCE($3, keywords),
      learning_goals = COALESCE($4, learning_goals),
      document_sources = COALESCE($5, document_sources),
      api_connections = COALESCE($6, api_connections),
      priority = COALESCE($7, priority),
      focus_embedding = COALESCE($8, focus_embedding),
      updated_at = NOW()
     WHERE id = $9 AND context = $10
     RETURNING *`,
    [
      updates.name || null,
      updates.description || null,
      updates.keywords || null,
      updates.learning_goals || null,
      updates.document_sources ? JSON.stringify(updates.document_sources) : null,
      updates.api_connections ? JSON.stringify(updates.api_connections) : null,
      updates.priority || null,
      embedding ? `[${embedding.join(',')}]` : null,
      id,
      context,
    ]
  );

  if (result.rows.length === 0) {return null;}

  return formatDomainFocus(result.rows[0]);
}

/**
 * Holt einen Domain Focus
 */
export async function getDomainFocus(
  id: string,
  context: AIContext = 'personal'
): Promise<DomainFocus | null> {
  const result = await queryContext(
    context,
    `SELECT * FROM domain_focus WHERE id = $1 AND context = $2`,
    [id, context]
  );

  if (result.rows.length === 0) {return null;}

  return formatDomainFocus(result.rows[0]);
}

/**
 * Holt alle Domain Focus Bereiche
 */
export async function getAllDomainFocus(
  context: AIContext = 'personal',
  activeOnly: boolean = false
): Promise<DomainFocus[]> {
  const result = await queryContext(
    context,
    `SELECT * FROM domain_focus
     WHERE context = $1 ${activeOnly ? 'AND is_active = true' : ''}
     ORDER BY priority DESC, created_at ASC`,
    [context]
  );

  return result.rows.map(formatDomainFocus);
}

/**
 * Aktiviert/Deaktiviert einen Domain Focus
 */
export async function toggleDomainFocus(
  id: string,
  isActive: boolean,
  context: AIContext = 'personal'
): Promise<boolean> {
  const result = await queryContext(
    context,
    `UPDATE domain_focus SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND context = $3`,
    [isActive, id, context]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Löscht einen Domain Focus
 */
export async function deleteDomainFocus(
  id: string,
  context: AIContext = 'personal'
): Promise<boolean> {
  const result = await queryContext(
    context,
    `DELETE FROM domain_focus WHERE id = $1 AND context = $2`,
    [id, context]
  );

  return (result.rowCount ?? 0) > 0;
}

// ===========================================
// Context Enhancement
// ===========================================

/**
 * Holt den aktiven Fokus-Kontext für LLM-Prompts
 */
export async function getActiveFocusContext(
  context: AIContext = 'personal'
): Promise<string> {
  const activeFocus = await getAllDomainFocus(context, true);

  if (activeFocus.length === 0) {
    return '';
  }

  const focusDescriptions = activeFocus
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5) // Max 5 Focus-Bereiche
    .map((f) => {
      let desc = `- ${f.name}`;
      if (f.description) {desc += `: ${f.description}`;}
      if (f.keywords.length > 0) {desc += ` (Keywords: ${f.keywords.join(', ')})`;}
      return desc;
    })
    .join('\n');

  return `
AKTIVE FOKUS-THEMEN:
${focusDescriptions}

Berücksichtige diese Themen bei deinen Antworten und Vorschlägen.
Wenn die Anfrage zu einem dieser Themen passt, gehe besonders detailliert darauf ein.`;
}

/**
 * Findet den am besten passenden Domain Focus für einen Text
 */
export async function findMatchingFocus(
  text: string,
  context: AIContext = 'personal'
): Promise<DomainFocus | null> {
  try {
    // 1. Generiere Embedding für den Text
    const textEmbedding = await generateEmbedding(text);

    // Guard: Skip vector query if embedding is empty (Ollama unavailable)
    if (!textEmbedding || textEmbedding.length === 0) {
      logger.debug('Skipping focus matching - no embedding available', { context });
      return null;
    }

    // 2. Suche ähnlichsten Focus
    const result = await queryContext(
      context,
      `SELECT *, 1 - (focus_embedding <=> $1::vector) as similarity
       FROM domain_focus
       WHERE context = $2 AND is_active = true AND focus_embedding IS NOT NULL
       ORDER BY similarity DESC
       LIMIT 1`,
      [`[${textEmbedding.join(',')}]`, context]
    );

    if (result.rows.length === 0) {return null;}

    const match = result.rows[0];

    // 3. Nur zurückgeben wenn Ähnlichkeit > 0.5
    if (match.similarity < 0.5) {return null;}

    // 4. Update Aktivität
    await queryContext(
      context,
      `UPDATE domain_focus SET
        ideas_count = ideas_count + 1,
        last_activity_at = NOW()
       WHERE id = $1`,
      [match.id]
    );

    return formatDomainFocus(match);
  } catch (error) {
    logger.warn('Could not find matching focus', { error });
    return null;
  }
}

/**
 * Prüft ob ein Text zu einem Fokus-Thema passt (Keyword-basiert)
 */
export function matchesFocusKeywords(
  text: string,
  focus: DomainFocus
): boolean {
  const lowerText = text.toLowerCase();

  return focus.keywords.some((kw) =>
    lowerText.includes(kw.toLowerCase())
  );
}

// ===========================================
// Statistics & Insights
// ===========================================

/**
 * Holt Statistiken für Domain Focus
 */
export async function getDomainFocusStats(
  context: AIContext = 'personal'
): Promise<{
  total_focus_areas: number;
  active_focus_areas: number;
  total_ideas_linked: number;
  most_active_focus: DomainFocus | null;
  least_active_focus: DomainFocus | null;
}> {
  const allFocus = await getAllDomainFocus(context);

  if (allFocus.length === 0) {
    return {
      total_focus_areas: 0,
      active_focus_areas: 0,
      total_ideas_linked: 0,
      most_active_focus: null,
      least_active_focus: null,
    };
  }

  const activeFocus = allFocus.filter((f) => f.is_active);
  const totalIdeas = allFocus.reduce((sum, f) => sum + f.ideas_count, 0);

  const sortedByActivity = [...allFocus].sort((a, b) => b.ideas_count - a.ideas_count);

  return {
    total_focus_areas: allFocus.length,
    active_focus_areas: activeFocus.length,
    total_ideas_linked: totalIdeas,
    most_active_focus: sortedByActivity[0] || null,
    least_active_focus: sortedByActivity[sortedByActivity.length - 1] || null,
  };
}

// ===========================================
// Helpers
// ===========================================

function formatDomainFocus(row: Record<string, unknown>): DomainFocus {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    name: row.name as string,
    description: row.description as string | null,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    document_sources: parseJSON(row.document_sources, []),
    api_connections: parseJSON(row.api_connections, []),
    learning_goals: Array.isArray(row.learning_goals) ? row.learning_goals : [],
    is_active: row.is_active as boolean,
    priority: row.priority as number,
    ideas_count: row.ideas_count as number,
    last_activity_at: row.last_activity_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function parseJSON<T>(value: unknown, defaultValue: T): T {
  if (Array.isArray(value)) {return value as T;}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

// ===========================================
// Preset Focus Areas
// ===========================================

/**
 * Erstellt vordefinierte Focus-Bereiche
 */
export async function createPresetFocusAreas(
  context: AIContext = 'work'
): Promise<void> {
  const presets: CreateDomainFocusInput[] = [
    {
      name: 'API & Schnittstellen',
      description: 'REST APIs, SAP Integrationen, Daten-Schnittstellen',
      keywords: ['API', 'REST', 'SAP', 'Schnittstelle', 'Integration', 'BAPI', 'RFC', 'OData'],
      learning_goals: [
        'SAP API Best Practices verstehen',
        'REST API Design Patterns',
        'Datenintegrations-Strategien',
      ],
      priority: 8,
    },
    {
      name: 'Automatisierung',
      description: 'Workflow-Automatisierung, RPA, Prozessoptimierung',
      keywords: ['Automatisierung', 'RPA', 'Workflow', 'Prozess', 'Bot', 'Script'],
      learning_goals: [
        'Automatisierungs-Potenziale erkennen',
        'RPA-Tools evaluieren',
        'Prozesse effizienter gestalten',
      ],
      priority: 7,
    },
    {
      name: 'Business-Strategie',
      description: 'Geschäftsentwicklung, Marktanalyse, Wachstum',
      keywords: ['Strategie', 'Markt', 'Wachstum', 'Business', 'Geschäftsmodell'],
      learning_goals: [
        'Markttrends verstehen',
        'Wettbewerbsanalysen durchführen',
        'Strategische Entscheidungen treffen',
      ],
      priority: 6,
    },
  ];

  for (const preset of presets) {
    try {
      await createDomainFocus(preset, context);
    } catch (error) {
      // Ignore if already exists
    }
  }

  logger.info('Preset focus areas created', { context, count: presets.length });
}
