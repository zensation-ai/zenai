/**
 * Tool Handlers
 *
 * Implements the actual functionality for Claude Tool Use.
 * Connects the abstract tool definitions with real operations.
 *
 * Organized into sub-modules:
 * - github-tools: GitHub integration handlers
 * - project-tools: Project/workspace analysis handlers
 * - web-tools: Web search and URL fetch handlers
 * - code-tools: Sandboxed code execution handler
 * - document-tools: Document search, analysis, and synthesis handlers
 *
 * @module services/tool-handlers
 */

import { logger } from '../../utils/logger';
import {
  toolRegistry,
  TOOL_SEARCH_IDEAS,
  TOOL_CREATE_IDEA,
  TOOL_GET_RELATED,
  TOOL_CALCULATE,
  TOOL_REMEMBER,
  TOOL_RECALL,
  TOOL_MEMORY_INTROSPECT,
  TOOL_WEB_SEARCH,
  TOOL_FETCH_URL,
  TOOL_GITHUB_SEARCH,
  TOOL_GITHUB_CREATE_ISSUE,
  TOOL_GITHUB_REPO_INFO,
  TOOL_GITHUB_LIST_ISSUES,
  TOOL_GITHUB_PR_SUMMARY,
  TOOL_ANALYZE_PROJECT,
  TOOL_PROJECT_SUMMARY,
  TOOL_LIST_PROJECT_FILES,
  TOOL_EXECUTE_CODE,
  TOOL_ANALYZE_DOCUMENT,
  TOOL_SEARCH_DOCUMENTS,
  TOOL_SYNTHESIZE_KNOWLEDGE,
  TOOL_CREATE_MEETING,
  TOOL_NAVIGATE_TO,
  TOOL_APP_HELP,
  TOOL_GET_REVENUE_METRICS,
  TOOL_GET_TRAFFIC_ANALYTICS,
  TOOL_GET_SEO_PERFORMANCE,
  TOOL_GET_SYSTEM_HEALTH,
  TOOL_GENERATE_BUSINESS_REPORT,
  TOOL_IDENTIFY_ANOMALIES,
  TOOL_COMPARE_PERIODS,
  TOOL_CREATE_CALENDAR_EVENT,
  TOOL_LIST_CALENDAR_EVENTS,
  TOOL_DRAFT_EMAIL,
  TOOL_ESTIMATE_TRAVEL,
  TOOL_GET_DIRECTIONS,
  TOOL_GET_OPENING_HOURS,
  TOOL_FIND_NEARBY,
  TOOL_OPTIMIZE_ROUTE,
  TOOL_MEMORY_UPDATE,
  TOOL_MEMORY_DELETE,
  TOOL_MEMORY_UPDATE_PROFILE,
  TOOL_ASK_INBOX,
  TOOL_INBOX_SUMMARY,
  TOOL_MCP_CALL_TOOL,
  TOOL_MCP_LIST_TOOLS,
  TOOL_UPDATE_IDEA,
  TOOL_ARCHIVE_IDEA,
  TOOL_DELETE_IDEA,
  ToolExecutionContext,
} from '../claude/tool-use';
import { createMeeting } from '../meetings';
import { createCalendarEvent, getCalendarEvents } from '../calendar';
import { estimateTravelDuration } from '../travel-estimator';
import { getFeatureHelp } from '../assistant-knowledge';
import { enhancedRAG } from '../enhanced-rag';
import { queryContext } from '../../utils/database-context';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding } from '../ai';
import { longTermMemory, episodicMemory, workingMemory, crossContextSharing } from '../memory';

// Sub-module imports
import { handleWebSearch, handleFetchUrl } from './web-tools';
import { handleGitHubSearch, handleGitHubCreateIssue, handleGitHubRepoInfo, handleGitHubListIssues, handleGitHubPRSummary } from './github-tools';
import { handleAnalyzeProject, handleProjectSummary, handleListProjectFiles } from './project-tools';
import { handleExecuteCode } from './code-tools';
import { handleSearchDocuments, handleAnalyzeDocument, handleSynthesizeKnowledge } from './document-tools';
import {
  handleGetRevenueMetrics,
  handleGetTrafficAnalytics,
  handleGetSeoPerformance,
  handleGetSystemHealth,
  handleGenerateBusinessReport,
  handleIdentifyAnomalies,
  handleComparePeriods,
} from './business-tools';
import {
  handleGetDirections,
  handleGetOpeningHours,
  handleFindNearbyPlaces,
  handleOptimizeDayRoute,
} from './maps-tools';
import {
  handleMemoryUpdate,
  handleMemoryDelete,
  handleMemoryUpdateProfile,
} from './memory-tools';
import {
  handleAskInbox,
  handleInboxSummary,
} from './email-tools';
import {
  handleMCPCallTool,
  handleMCPListTools,
} from './mcp-tools';

// ===========================================
// Core Tool Handler Implementations
// ===========================================

/**
 * Search ideas handler
 * Uses request-scoped context for safe parallel execution
 */
async function handleSearchIdeas(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const limit = (input.limit as number) || 5;
  const context = execContext.aiContext;

  if (!query) {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  logger.debug('Tool: search_ideas', { query, limit, context });

  try {
    const results = await enhancedRAG.quickRetrieve(query, context, limit);

    if (results.length === 0) {
      return `Keine Ideen gefunden für: "${query}"`;
    }

    const formatted = results.map((r, i) =>
      `${i + 1}. **${r.title}** (Score: ${(r.score * 100).toFixed(0)}%)\n   ${r.summary || 'Keine Zusammenfassung'}`
    ).join('\n\n');

    return `Gefundene Ideen (${results.length}):\n\n${formatted}`;
  } catch (error) {
    logger.error('Tool search_ideas failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Suche. Bitte versuche es erneut.';
  }
}

/**
 * Create idea handler
 * Uses request-scoped context for safe parallel execution
 */
async function handleCreateIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const title = input.title as string;
  const type = input.type as string;
  const summary = input.summary as string;
  const category = (input.category as string) || 'personal';
  const priority = (input.priority as string) || 'medium';
  const nextSteps = input.next_steps as string[] | undefined;
  const context = execContext.aiContext;

  if (!title || !type || !summary) {
    return 'Fehler: Titel, Typ und Zusammenfassung sind erforderlich.';
  }

  logger.debug('Tool: create_idea', { title, type, context });

  try {
    const id = uuidv4();

    // Generate embedding
    const embedding = await generateEmbedding(`${title} ${summary}`);

    // Insert into database
    await queryContext(
      context,
      `INSERT INTO ideas (id, context, title, type, category, priority, summary, next_steps, embedding, raw_transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        context,
        title,
        type,
        category,
        priority,
        summary,
        nextSteps ? JSON.stringify(nextSteps) : null,
        embedding.length > 0 ? `[${embedding.join(',')}]` : null,
        summary, // Use summary as raw_transcript
      ]
    );

    logger.info('Idea created via tool', { id, title });

    const contextLabels: Record<string, string> = { personal: 'Persönlich', work: 'Arbeit', learning: 'Lernen', creative: 'Kreativ' };
    const contextLabel = contextLabels[context] || context;

    return `Idee erfolgreich erstellt:
- **Titel**: ${title}
- **Typ**: ${type}
- **Kategorie**: ${category}
- **Priorität**: ${priority}
- **Bereich**: ${contextLabel}
- **ID**: ${id}`;
  } catch (error) {
    logger.error('Tool create_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Erstellen der Idee. Bitte versuche es erneut.';
  }
}

/**
 * Get related ideas handler
 * Uses request-scoped context for safe parallel execution
 */
async function handleGetRelated(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  const relationshipTypes = input.relationship_types as string[] | undefined;
  const context = execContext.aiContext;

  if (!ideaId) {
    return 'Fehler: Keine Idee-ID angegeben.';
  }

  logger.debug('Tool: get_related_ideas', { ideaId, relationshipTypes, context });

  try {
    // Get the source idea first
    const sourceResult = await queryContext(
      context,
      `SELECT id, title, summary FROM ideas WHERE id = $1 AND context = $2`,
      [ideaId, context]
    );

    if (sourceResult.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    const source = sourceResult.rows[0];

    // Get connections from knowledge graph
    let connectionQuery = `
      SELECT
        CASE WHEN kc.source_idea_id = $1 THEN kc.target_idea_id ELSE kc.source_idea_id END as related_id,
        kc.relationship_type,
        kc.strength,
        i.title,
        i.summary
      FROM knowledge_connections kc
      JOIN ideas i ON i.id = CASE WHEN kc.source_idea_id = $1 THEN kc.target_idea_id ELSE kc.source_idea_id END
      WHERE (kc.source_idea_id = $1 OR kc.target_idea_id = $1)
        AND i.context = $2
        AND i.is_archived = false
    `;

    const params: (string | string[])[] = [ideaId, context];

    if (relationshipTypes && relationshipTypes.length > 0) {
      connectionQuery += ` AND kc.relationship_type = ANY($3)`;
      params.push(relationshipTypes);
    }

    connectionQuery += ` ORDER BY kc.strength DESC LIMIT 10`;

    const relatedResult = await queryContext(context, connectionQuery, params);

    if (relatedResult.rows.length === 0) {
      return `Keine verbundenen Ideen für "${source.title}" gefunden.`;
    }

    const formatted = relatedResult.rows.map((r: { title: string; relationship_type: string; strength: number; summary?: string }, i: number) =>
      `${i + 1}. **${r.title}** (${r.relationship_type}, Stärke: ${(r.strength * 100).toFixed(0)}%)\n   ${r.summary || 'Keine Zusammenfassung'}`
    ).join('\n\n');

    return `Verbundene Ideen zu "${source.title}":\n\n${formatted}`;
  } catch (error) {
    logger.error('Tool get_related_ideas failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der verbundenen Ideen.';
  }
}

// ===========================================
// Safe Math Evaluator (Recursive Descent Parser)
// ===========================================

/**
 * Safe math expression evaluator using recursive descent parsing.
 * Replaces Function()/eval() to eliminate code injection risks.
 * Supports: +, -, *, /, %, parentheses, unary minus, decimal numbers.
 */
function safeEvaluate(expr: string): number {
  // Only allow digits, operators, parentheses, decimal points, whitespace
  const sanitized = expr.replace(/\s/g, '');
  if (!/^[0-9+\-*/().%]+$/.test(sanitized)) {
    throw new Error('Ungültige Zeichen im Ausdruck. Nur Zahlen und +, -, *, /, (), % erlaubt.');
  }
  if (sanitized.length === 0 || !/\d/.test(sanitized)) {
    throw new Error('Ungültiger mathematischer Ausdruck.');
  }

  let pos = 0;

  function parseExpression(): number {
    let result = parseTerm();
    while (pos < sanitized.length && (sanitized[pos] === '+' || sanitized[pos] === '-')) {
      const op = sanitized[pos++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < sanitized.length && (sanitized[pos] === '*' || sanitized[pos] === '/' || sanitized[pos] === '%')) {
      const op = sanitized[pos++];
      const right = parseFactor();
      if ((op === '/' || op === '%') && right === 0) {
        throw new Error('Division durch Null ist nicht erlaubt.');
      }
      if (op === '*') {result *= right;}
      else if (op === '/') {result /= right;}
      else {result %= right;}
    }
    return result;
  }

  function parseFactor(): number {
    // Unary minus
    if (pos < sanitized.length && sanitized[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    // Unary plus
    if (pos < sanitized.length && sanitized[pos] === '+') {
      pos++;
      return parseFactor();
    }
    // Parenthesized expression
    if (pos < sanitized.length && sanitized[pos] === '(') {
      pos++; // skip '('
      const result = parseExpression();
      if (pos >= sanitized.length || sanitized[pos] !== ')') {
        throw new Error('Unbalancierte Klammern im Ausdruck.');
      }
      pos++; // skip ')'
      return result;
    }
    // Number (integer or decimal)
    const start = pos;
    while (pos < sanitized.length && (sanitized[pos] >= '0' && sanitized[pos] <= '9' || sanitized[pos] === '.')) {
      pos++;
    }
    if (pos === start) {
      throw new Error('Ungültiger mathematischer Ausdruck.');
    }
    const numStr = sanitized.slice(start, pos);
    const num = parseFloat(numStr);
    if (isNaN(num)) {
      throw new Error(`Ungültige Zahl: "${numStr}"`);
    }
    return num;
  }

  const result = parseExpression();
  if (pos !== sanitized.length) {
    throw new Error('Ungültiger mathematischer Ausdruck - unerwartete Zeichen am Ende.');
  }
  return result;
}

/**
 * Calculate handler (safe math evaluation)
 * Context not used but included for consistent handler signature
 */
async function handleCalculate(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const expression = input.expression as string;

  if (!expression || typeof expression !== 'string') {
    return 'Fehler: Kein mathematischer Ausdruck angegeben.';
  }

  logger.debug('Tool: calculate', { expression });

  try {
    // SECURITY: Safe math evaluation using recursive descent parser
    // Avoids Function()/eval() which are code injection vectors
    const result = safeEvaluate(expression);

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return 'Fehler: Das Ergebnis ist keine gültige Zahl.';
    }

    return `${expression} = **${result}**`;
  } catch (evalError) {
    const msg = evalError instanceof Error ? evalError.message : 'Ungültiger Ausdruck';
    return `Fehler: ${msg}`;
  }
}

// ===========================================
// Memory Handlers (HiMeS Integration)
// ===========================================

/**
 * Remember handler - stores information in long-term memory
 * Uses request-scoped context for safe parallel execution
 */
async function handleRemember(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const content = input.content as string;
  const factType = (input.fact_type as string) || 'knowledge';
  const confidence = (input.confidence as number) || 0.8;
  const context = execContext.aiContext;

  if (!content) {
    return 'Fehler: Kein Inhalt zum Merken angegeben.';
  }

  const validFactTypes = ['preference', 'behavior', 'knowledge', 'goal', 'context'];
  if (!validFactTypes.includes(factType)) {
    return `Fehler: Ungültiger Fakt-Typ. Erlaubt: ${validFactTypes.join(', ')}`;
  }

  logger.debug('Tool: remember', { factType, confidence, context });

  try {
    // Store in long-term memory
    await longTermMemory.addFact(context, {
      factType: factType as 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context',
      content,
      confidence: Math.min(1.0, Math.max(0.0, confidence)),
      source: 'explicit',
    });

    logger.info('Fact stored in long-term memory', {
      factType,
      confidence,
      contentPreview: content.substring(0, 50),
    });

    // Confirm with appropriate response based on fact type
    const confirmationMessages: Record<string, string> = {
      preference: 'Präferenz',
      behavior: 'Verhaltensmuster',
      knowledge: 'Wissen',
      goal: 'Ziel',
      context: 'Kontext-Information',
    };

    return `✅ ${confirmationMessages[factType] || 'Information'} gespeichert: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"

Ich werde mich daran erinnern und diese Information in zukünftigen Gesprächen berücksichtigen.`;
  } catch (error) {
    logger.error('Tool remember failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Speichern. Bitte versuche es erneut.';
  }
}

/**
 * Recall handler - searches episodic and long-term memory
 * Uses request-scoped context for safe parallel execution
 */
async function handleRecall(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const memoryType = (input.memory_type as string) || 'all';
  const limit = Math.min((input.limit as number) || 5, 10);
  const context = execContext.aiContext;

  if (!query) {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  logger.debug('Tool: recall', { query, memoryType, limit, context });

  try {
    const results: string[] = [];
    let episodeCount = 0;
    let factCount = 0;

    // Retrieve from Episodic Memory (past conversations)
    if (memoryType === 'episodes' || memoryType === 'all') {
      const episodes = await episodicMemory.retrieve(query, context, { limit });

      if (episodes.length > 0) {
        episodeCount = episodes.length;
        results.push('**Erinnerungen an frühere Gespräche:**');

        for (const episode of episodes) {
          const timeAgo = formatTimeAgo(episode.timestamp);
          const emotionalMood = getEmotionalLabel(episode.emotionalValence);

          results.push(
            `• (${timeAgo}, ${emotionalMood}) Du: "${episode.trigger.substring(0, 100)}${episode.trigger.length > 100 ? '...' : ''}"`
          );
        }
      }
    }

    // Retrieve from Long-Term Memory (stored facts)
    if (memoryType === 'facts' || memoryType === 'all') {
      const longTermResults = await longTermMemory.retrieve(context, query);

      if (longTermResults.facts.length > 0) {
        factCount = longTermResults.facts.length;
        results.push('\n**Bekannte Fakten über dich:**');

        for (const fact of longTermResults.facts.slice(0, limit)) {
          const confidenceLabel = fact.confidence >= 0.8 ? '🟢' : fact.confidence >= 0.6 ? '🟡' : '🔴';
          results.push(`${confidenceLabel} ${fact.content} (${fact.factType})`);
        }
      }

      // Include relevant patterns
      if (longTermResults.patterns.length > 0 && results.length < limit * 2) {
        results.push('\n**Erkannte Muster:**');
        for (const pattern of longTermResults.patterns.slice(0, 3)) {
          results.push(`• ${pattern.pattern}`);
        }
      }
    }

    if (results.length === 0) {
      return `Ich habe keine Erinnerungen zu "${query}" gefunden.

Dies kann bedeuten:
• Wir haben dieses Thema noch nicht besprochen
• Die Information wurde noch nicht explizit gespeichert
• Verwende ggf. andere Suchbegriffe`;
    }

    return `Suchergebnisse für "${query}" (${episodeCount} Episoden, ${factCount} Fakten):\n\n${results.join('\n')}`;
  } catch (error) {
    logger.error('Tool recall failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der Erinnerungen. Bitte versuche es erneut.';
  }
}

/**
 * Memory Introspect handler - AI inspects its own memory state
 * Mem0 "Memory-as-a-Tool" pattern for on-demand memory access
 */
async function handleMemoryIntrospect(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const aspect = (input.aspect as string) || 'overview';
  const topicFilter = input.topic_filter as string | undefined;
  const context = execContext.aiContext;
  const sessionId = execContext.sessionId;

  logger.debug('Tool: memory_introspect', { aspect, topicFilter, context });

  try {
    const sections: string[] = [];

    // Facts
    if (aspect === 'facts' || aspect === 'overview') {
      const facts = await longTermMemory.getFacts(context);
      const filtered = topicFilter
        ? facts.filter(f => f.content.toLowerCase().includes(topicFilter.toLowerCase()))
        : facts;

      if (filtered.length > 0) {
        sections.push(`**Langzeitgedaechtnis (${filtered.length} Fakten):**`);
        const grouped: Record<string, typeof filtered> = {};
        for (const f of filtered.slice(0, 20)) {
          if (!grouped[f.factType]) {grouped[f.factType] = [];}
          grouped[f.factType].push(f);
        }
        for (const [type, typeFacts] of Object.entries(grouped)) {
          sections.push(`  _${type}_:`);
          for (const f of typeFacts) {
            const conf = f.confidence >= 0.8 ? 'hoch' : f.confidence >= 0.5 ? 'mittel' : 'niedrig';
            sections.push(`  - ${f.content} (Konfidenz: ${conf}, ${f.occurrences}x bestaetigt)`);
          }
        }
      } else {
        sections.push('**Langzeitgedaechtnis:** Keine Fakten gespeichert.');
      }
    }

    // Episodes
    if (aspect === 'episodes' || aspect === 'overview') {
      const query = topicFilter || 'recent';
      const episodes = await episodicMemory.retrieve(query, context, { limit: 5, minStrength: 0.1 });

      if (episodes.length > 0) {
        sections.push(`\n**Episodisches Gedaechtnis (${episodes.length} Episoden):**`);
        for (const ep of episodes) {
          const timeAgo = formatTimeAgo(ep.timestamp);
          sections.push(`  - ${timeAgo}: "${ep.trigger.substring(0, 80)}..." (Staerke: ${ep.retrievalStrength.toFixed(2)})`);
        }
      } else {
        sections.push('\n**Episodisches Gedaechtnis:** Keine relevanten Episoden.');
      }
    }

    // Working Memory
    if (aspect === 'working_memory' || aspect === 'overview') {
      const wmState = sessionId ? workingMemory.getState(sessionId) : null;
      if (wmState) {
        sections.push(`\n**Arbeitsgedaechtnis (${wmState.slots.length}/${wmState.capacity} Slots):**`);
        sections.push(`  Aktuelles Ziel: ${wmState.currentGoal}`);
        for (const slot of wmState.slots) {
          sections.push(`  - [${slot.type}] ${slot.content} (Aktivierung: ${slot.activation.toFixed(2)})`);
        }
      } else {
        sections.push('\n**Arbeitsgedaechtnis:** Keine aktive Session.');
      }
    }

    // Cross-Context
    if (aspect === 'cross_context' || aspect === 'overview') {
      const shared = await crossContextSharing.getSharedFacts(context);
      if (shared.length > 0) {
        sections.push(`\n**Kontextuebergreifende Insights (${shared.length}):**`);
        for (const f of shared.slice(0, 10)) {
          sections.push(`  - ${f.content}`);
        }
      } else {
        sections.push('\n**Kontextuebergreifende Insights:** Keine geteilten Fakten.');
      }
    }

    // Stats summary for overview
    if (aspect === 'overview') {
      const wmStats = workingMemory.getStats();
      sections.push(`\n**Zusammenfassung:**`);
      sections.push(`  - Aktive WM-Sessions: ${wmStats.activeSessions}`);
      sections.push(`  - Durchschnittliche Slots/Session: ${wmStats.avgSlotsPerSession}`);
    }

    return sections.join('\n');
  } catch (error) {
    logger.error('Tool memory_introspect failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Inspizieren des Gedaechtniszustands.';
  }
}

/**
 * Format timestamp as relative time ago
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `vor ${diffMins} Min.`;
  } else if (diffHours < 24) {
    return `vor ${diffHours} Std.`;
  } else if (diffDays === 1) {
    return 'gestern';
  } else if (diffDays < 7) {
    return `vor ${diffDays} Tagen`;
  } else if (diffDays < 30) {
    return `vor ${Math.floor(diffDays / 7)} Wochen`;
  } else {
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  }
}

/**
 * Get emotional label from valence
 */
function getEmotionalLabel(valence: number): string {
  if (valence > 0.3) {return 'positive Stimmung';}
  if (valence < -0.3) {return 'angespannt';}
  return 'neutral';
}

// ===========================================
// Assistant Tools
// ===========================================

async function handleCreateMeeting(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const title = input.title as string;
  const date = input.date as string;
  const duration_minutes = (input.duration_minutes as number) || 60;
  const participants = input.participants as string[] | undefined;
  const location = input.location as string | undefined;

  if (!title || !date) {
    return 'Fehler: Titel und Datum sind erforderlich.';
  }

  try {
    const meeting = await createMeeting({
      title,
      date,
      duration_minutes,
      participants,
      location,
    });

    const dateFormatted = new Date(meeting.date).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const parts = [`Meeting erstellt: "${meeting.title}" am ${dateFormatted}.`];
    if (participants && participants.length > 0) {
      parts.push(`Teilnehmer: ${participants.join(', ')}.`);
    }
    if (location) {
      parts.push(`Ort: ${location}.`);
    }
    parts.push(`Dauer: ${duration_minutes} Minuten.`);

    return parts.join(' ');
  } catch (error) {
    logger.error('Tool create_meeting failed', error instanceof Error ? error : undefined);
    return `Fehler beim Erstellen des Meetings: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

async function handleNavigateTo(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const page = input.page as string;
  const reason = (input.reason as string) || '';

  return JSON.stringify({
    action: 'navigate',
    page,
    reason,
    message: `Navigiere zu ${page}. ${reason}`.trim(),
  });
}

async function handleAppHelp(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const topic = input.topic as string;
  if (!topic) {
    return 'Bitte gib an, zu welchem Feature du Hilfe brauchst.';
  }
  return getFeatureHelp(topic);
}

// ===========================================
// CRUD Tools: Update, Archive, Delete Ideas
// ===========================================

async function handleUpdateIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  if (!ideaId) return 'Fehler: Keine Idee-ID angegeben.';

  const context = execContext.aiContext;
  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let paramIdx = 1;

  const fields: [string, string][] = [
    ['title', 'title'],
    ['summary', 'summary'],
    ['priority', 'priority'],
    ['category', 'category'],
    ['type', 'type'],
  ];

  for (const [inputKey, dbCol] of fields) {
    if (input[inputKey] !== undefined) {
      updates.push(`${dbCol} = $${paramIdx++}`);
      values.push(input[inputKey] as string);
    }
  }

  if (updates.length === 0) {
    return 'Fehler: Keine Felder zum Aktualisieren angegeben.';
  }

  updates.push(`updated_at = NOW()`);
  values.push(ideaId, context);

  try {
    const result = await queryContext(
      context,
      `UPDATE ideas SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND context = $${paramIdx} RETURNING id, title`,
      values
    );

    if (result.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    logger.info('Idea updated via tool', { id: ideaId });
    return `Idee "${result.rows[0].title}" erfolgreich aktualisiert.`;
  } catch (error) {
    logger.error('Tool update_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Aktualisieren der Idee.';
  }
}

async function handleArchiveIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  if (!ideaId) return 'Fehler: Keine Idee-ID angegeben.';

  const context = execContext.aiContext;

  try {
    const result = await queryContext(
      context,
      `UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1 AND context = $2 RETURNING id, title`,
      [ideaId, context]
    );

    if (result.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    logger.info('Idea archived via tool', { id: ideaId });
    return `Idee "${result.rows[0].title}" wurde archiviert.`;
  } catch (error) {
    logger.error('Tool archive_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Archivieren der Idee.';
  }
}

async function handleDeleteIdea(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const ideaId = input.idea_id as string;
  if (!ideaId) return 'Fehler: Keine Idee-ID angegeben.';

  const context = execContext.aiContext;

  try {
    const result = await queryContext(
      context,
      `DELETE FROM ideas WHERE id = $1 AND context = $2 RETURNING id, title`,
      [ideaId, context]
    );

    if (result.rows.length === 0) {
      return `Idee mit ID ${ideaId} nicht gefunden.`;
    }

    logger.info('Idea deleted via tool', { id: ideaId });
    return `Idee "${result.rows[0].title}" wurde geloescht.`;
  } catch (error) {
    logger.error('Tool delete_idea failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Loeschen der Idee.';
  }
}

// ===========================================
// Phase 35: Calendar, Email, Travel Handlers
// ===========================================

async function handleCreateCalendarEvent(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const title = input.title as string;
  const startTime = input.start_time as string;

  if (!title || !startTime) {
    return 'Fehler: Titel und Startzeit sind erforderlich.';
  }

  try {
    const endTime = input.end_time as string | undefined;
    const event = await createCalendarEvent(execContext.aiContext, {
      title,
      start_time: startTime,
      end_time: endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(),
      event_type: (input.event_type as 'appointment' | 'reminder' | 'deadline' | 'focus_time') || 'appointment',
      location: input.location as string | undefined,
      participants: input.participants as string[] | undefined,
      description: input.description as string | undefined,
      ai_generated: true,
    });

    const dateFormatted = new Date(event.start_time).toLocaleString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const parts = [`Kalender-Eintrag erstellt: "${event.title}" am ${dateFormatted}.`];
    if (event.location) {parts.push(`Ort: ${event.location}.`);}
    if (event.participants.length > 0) {parts.push(`Teilnehmer: ${event.participants.join(', ')}.`);}
    return parts.join(' ');
  } catch (error) {
    logger.error('Tool create_calendar_event failed', error instanceof Error ? error : undefined);
    return `Fehler beim Erstellen des Kalender-Eintrags: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

async function handleListCalendarEvents(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const start = input.start as string;
  const end = input.end as string;

  if (!start || !end) {
    return 'Fehler: Start- und Enddatum sind erforderlich.';
  }

  try {
    const events = await getCalendarEvents(execContext.aiContext, {
      start,
      end,
      event_type: input.event_type as 'appointment' | 'reminder' | 'deadline' | 'travel_block' | 'focus_time' | undefined,
    });

    if (events.length === 0) {
      return 'Keine Kalender-Eintraege in diesem Zeitraum gefunden.';
    }

    const lines = events.map(e => {
      const date = new Date(e.start_time).toLocaleString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const parts = [`- ${date}: ${e.title}`];
      if (e.location) {parts.push(`(${e.location})`);}
      if (e.event_type !== 'appointment') {parts.push(`[${e.event_type}]`);}
      return parts.join(' ');
    });

    return `${events.length} Kalender-Eintraege gefunden:\n${lines.join('\n')}`;
  } catch (error) {
    logger.error('Tool list_calendar_events failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der Kalender-Eintraege: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

async function handleDraftEmail(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const keyPoints = input.key_points as string[];
  if (!keyPoints || keyPoints.length === 0) {
    return 'Fehler: Mindestens ein Kernpunkt ist erforderlich.';
  }

  const recipient = (input.recipient as string) || '[Empfaenger]';
  const subject = (input.subject as string) || '';
  const tone = (input.tone as string) || 'formal';

  // Build the email draft using a simple template
  const greeting = tone === 'formal' ? 'Sehr geehrte/r' : (tone === 'friendly' ? 'Liebe/r' : 'Hallo');
  const closing = tone === 'formal' ? 'Mit freundlichen Gruessen' : (tone === 'friendly' ? 'Herzliche Gruesse' : 'Viele Gruesse');

  const body = keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

  const email = `An: ${recipient}
Betreff: ${subject || 'Kein Betreff'}

${greeting} ${recipient},

${body}

${closing}`;

  return `E-Mail-Entwurf erstellt:\n\n${email}\n\n---\nDu kannst den Entwurf kopieren und in deinem Mail-Programm verwenden.`;
}

async function handleEstimateTravel(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const origin = input.origin as string;
  const destination = input.destination as string;

  if (!origin || !destination) {
    return 'Fehler: Start- und Zielort sind erforderlich.';
  }

  try {
    const mode = (input.mode as 'driving' | 'transit' | 'walking' | 'cycling') || 'driving';
    const estimate = await estimateTravelDuration(origin, destination, mode);

    const hours = Math.floor(estimate.duration_minutes / 60);
    const minutes = estimate.duration_minutes % 60;
    const durationStr = hours > 0 ? `${hours} Stunden ${minutes} Minuten` : `${minutes} Minuten`;
    const modeLabels: Record<string, string> = { driving: 'Auto', transit: 'OEPNV', walking: 'zu Fuss', cycling: 'Fahrrad' };

    return `Reisezeit-Schaetzung:\n- Von: ${estimate.origin}\n- Nach: ${estimate.destination}\n- Dauer: ${durationStr}\n- Entfernung: ${estimate.distance_km} km\n- Transportmittel: ${modeLabels[estimate.mode] || estimate.mode}\n- Quelle: ${estimate.source === 'openrouteservice' ? 'OpenRouteService' : 'Schaetzung'}`;
  } catch (error) {
    logger.error('Tool estimate_travel failed', error instanceof Error ? error : undefined);
    return `Fehler bei der Reisezeit-Schaetzung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

// ===========================================
// Registration
// ===========================================

/**
 * Register all tool handlers
 * Call this during application startup
 */
export function registerAllToolHandlers(): void {
  logger.info('Registering tool handlers');

  // Core tools
  toolRegistry.register(TOOL_SEARCH_IDEAS, handleSearchIdeas);
  toolRegistry.register(TOOL_CREATE_IDEA, handleCreateIdea);
  toolRegistry.register(TOOL_GET_RELATED, handleGetRelated);
  toolRegistry.register(TOOL_CALCULATE, handleCalculate);

  // Memory tools (HiMeS integration)
  toolRegistry.register(TOOL_REMEMBER, handleRemember);
  toolRegistry.register(TOOL_RECALL, handleRecall);
  toolRegistry.register(TOOL_MEMORY_INTROSPECT, handleMemoryIntrospect);

  // Web tools (Internet access)
  toolRegistry.register(TOOL_WEB_SEARCH, handleWebSearch);
  toolRegistry.register(TOOL_FETCH_URL, handleFetchUrl);

  // GitHub tools (optional - requires GITHUB_PERSONAL_ACCESS_TOKEN)
  toolRegistry.register(TOOL_GITHUB_SEARCH, handleGitHubSearch);
  toolRegistry.register(TOOL_GITHUB_CREATE_ISSUE, handleGitHubCreateIssue);
  toolRegistry.register(TOOL_GITHUB_REPO_INFO, handleGitHubRepoInfo);
  toolRegistry.register(TOOL_GITHUB_LIST_ISSUES, handleGitHubListIssues);
  toolRegistry.register(TOOL_GITHUB_PR_SUMMARY, handleGitHubPRSummary);

  // Project context tools (codebase analysis)
  toolRegistry.register(TOOL_ANALYZE_PROJECT, handleAnalyzeProject);
  toolRegistry.register(TOOL_PROJECT_SUMMARY, handleProjectSummary);
  toolRegistry.register(TOOL_LIST_PROJECT_FILES, handleListProjectFiles);

  // Code execution tools (sandboxed code runner)
  toolRegistry.register(TOOL_EXECUTE_CODE, handleExecuteCode);

  // Document analysis tool (Phase 32)
  toolRegistry.register(TOOL_ANALYZE_DOCUMENT, handleAnalyzeDocument);

  // Document Vault tools (Phase 32)
  toolRegistry.register(TOOL_SEARCH_DOCUMENTS, handleSearchDocuments);

  // Synthesis tools (Phase 32B)
  toolRegistry.register(TOOL_SYNTHESIZE_KNOWLEDGE, handleSynthesizeKnowledge);

  // Assistant tools (Floating Assistant)
  toolRegistry.register(TOOL_CREATE_MEETING, handleCreateMeeting);
  toolRegistry.register(TOOL_NAVIGATE_TO, handleNavigateTo);
  toolRegistry.register(TOOL_APP_HELP, handleAppHelp);

  // Business Manager tools (Phase 34)
  toolRegistry.register(TOOL_GET_REVENUE_METRICS, handleGetRevenueMetrics);
  toolRegistry.register(TOOL_GET_TRAFFIC_ANALYTICS, handleGetTrafficAnalytics);
  toolRegistry.register(TOOL_GET_SEO_PERFORMANCE, handleGetSeoPerformance);
  toolRegistry.register(TOOL_GET_SYSTEM_HEALTH, handleGetSystemHealth);
  toolRegistry.register(TOOL_GENERATE_BUSINESS_REPORT, handleGenerateBusinessReport);
  toolRegistry.register(TOOL_IDENTIFY_ANOMALIES, handleIdentifyAnomalies);
  toolRegistry.register(TOOL_COMPARE_PERIODS, handleComparePeriods);

  // Phase 35: Calendar, Email, Travel tools
  toolRegistry.register(TOOL_CREATE_CALENDAR_EVENT, handleCreateCalendarEvent);
  toolRegistry.register(TOOL_LIST_CALENDAR_EVENTS, handleListCalendarEvents);
  toolRegistry.register(TOOL_DRAFT_EMAIL, handleDraftEmail);
  toolRegistry.register(TOOL_ESTIMATE_TRAVEL, handleEstimateTravel);

  // Phase 41: Google Maps tools
  toolRegistry.register(TOOL_GET_DIRECTIONS, handleGetDirections);
  toolRegistry.register(TOOL_GET_OPENING_HOURS, handleGetOpeningHours);
  toolRegistry.register(TOOL_FIND_NEARBY, handleFindNearbyPlaces);
  toolRegistry.register(TOOL_OPTIMIZE_ROUTE, handleOptimizeDayRoute);

  // Phase 42: Self-Editing Memory tools (Letta Pattern)
  toolRegistry.register(TOOL_MEMORY_UPDATE, handleMemoryUpdate);
  toolRegistry.register(TOOL_MEMORY_DELETE, handleMemoryDelete);
  toolRegistry.register(TOOL_MEMORY_UPDATE_PROFILE, handleMemoryUpdateProfile);

  // Phase 43: Email Intelligence tools
  toolRegistry.register(TOOL_ASK_INBOX, handleAskInbox);
  toolRegistry.register(TOOL_INBOX_SUMMARY, handleInboxSummary);

  // Phase 44: MCP Ecosystem tools
  toolRegistry.register(TOOL_MCP_CALL_TOOL, handleMCPCallTool);
  toolRegistry.register(TOOL_MCP_LIST_TOOLS, handleMCPListTools);

  // CRUD tools (Idea management)
  toolRegistry.register(TOOL_UPDATE_IDEA, handleUpdateIdea);
  toolRegistry.register(TOOL_ARCHIVE_IDEA, handleArchiveIdea);
  toolRegistry.register(TOOL_DELETE_IDEA, handleDeleteIdea);

  logger.info('Tool handlers registered', {
    tools: [
      'search_ideas',
      'create_idea',
      'get_related_ideas',
      'calculate',
      'remember',
      'recall',
      'memory_introspect',
      'web_search',
      'fetch_url',
      'github_search',
      'github_create_issue',
      'github_repo_info',
      'github_list_issues',
      'github_pr_summary',
      'analyze_project',
      'get_project_summary',
      'list_project_files',
      'execute_code',
      'analyze_document',
      'search_documents',
      'synthesize_knowledge',
      'create_meeting',
      'navigate_to',
      'app_help',
      'get_revenue_metrics',
      'get_traffic_analytics',
      'get_seo_performance',
      'get_system_health',
      'generate_business_report',
      'identify_anomalies',
      'compare_periods',
      'create_calendar_event',
      'list_calendar_events',
      'draft_email',
      'estimate_travel',
      'get_directions',
      'get_opening_hours',
      'find_nearby_places',
      'optimize_day_route',
      'memory_update',
      'memory_delete',
      'memory_update_profile',
      'ask_inbox',
      'inbox_summary',
      'mcp_call_tool',
      'mcp_list_tools',
      'update_idea',
      'archive_idea',
      'delete_idea',
    ],
  });
}

/**
 * Check if handlers are registered
 */
export function areToolsRegistered(): boolean {
  return toolRegistry.has('search_ideas') &&
         toolRegistry.has('web_search') &&
         toolRegistry.has('fetch_url') &&
         toolRegistry.has('analyze_project') &&
         toolRegistry.has('analyze_document');
}
