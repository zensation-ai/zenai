/**
 * Tool Handlers
 *
 * Implements the actual functionality for Claude Tool Use.
 * Connects the abstract tool definitions with real operations.
 *
 * @module services/tool-handlers
 */

import { logger } from '../utils/logger';
import {
  toolRegistry,
  TOOL_SEARCH_IDEAS,
  TOOL_CREATE_IDEA,
  TOOL_GET_RELATED,
  TOOL_CALCULATE,
  TOOL_REMEMBER,
  TOOL_RECALL,
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
  ToolExecutionContext,
} from './claude/tool-use';
import { enhancedRAG } from './enhanced-rag';
import { AIContext, queryContext } from '../utils/database-context';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding } from './ai';
import { longTermMemory, episodicMemory } from './memory';
import { searchWeb, formatSearchResults } from './web-search';
import { fetchUrl, formatForTool, isValidUrl } from './url-fetch';
import * as github from './github';
import * as projectContext from './project-context';

// ===========================================
// DEPRECATED: Legacy Context Management
// ===========================================
// These functions are kept for backward compatibility but should not be used.
// All new code should use the ToolExecutionContext passed to handlers.

/**
 * @deprecated Use ToolExecutionContext passed to handlers instead.
 * This global state is a race condition risk with parallel requests.
 */
let currentContext: AIContext = 'personal';

/**
 * @deprecated Use ToolExecutionContext passed to handlers instead.
 */
export function setToolContext(context: AIContext): void {
  logger.warn('setToolContext is deprecated - use ToolExecutionContext instead');
  currentContext = context;
}

/**
 * @deprecated Use ToolExecutionContext passed to handlers instead.
 */
export function getToolContext(): AIContext {
  return currentContext;
}

// ===========================================
// Tool Handler Implementations
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

    return `Idee erfolgreich erstellt:
- **Titel**: ${title}
- **Typ**: ${type}
- **Kategorie**: ${category}
- **Priorität**: ${priority}
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
    // Safe math evaluation - only allow numbers and basic operators
    const sanitized = expression.replace(/[^0-9+\-*/().%\s,]/g, '');

    if (sanitized !== expression.replace(/\s/g, '')) {
      return 'Fehler: Ungültige Zeichen im Ausdruck. Nur Zahlen und +, -, *, /, (), % erlaubt.';
    }

    // Check for valid expression structure
    if (!sanitized.trim() || !/\d/.test(sanitized)) {
      return 'Fehler: Ungültiger mathematischer Ausdruck.';
    }

    // Check for balanced parentheses
    let parenCount = 0;
    for (const char of sanitized) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) {
        return 'Fehler: Unbalancierte Klammern im Ausdruck.';
      }
    }
    if (parenCount !== 0) {
      return 'Fehler: Unbalancierte Klammern im Ausdruck.';
    }

    // Use Function constructor for evaluation (safer than eval but still limited)
    const result = Function(`"use strict"; return (${sanitized})`)();

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return 'Fehler: Das Ergebnis ist keine gültige Zahl.';
    }

    return `${expression} = **${result}**`;
  } catch {
    return `Fehler: Ungültiger mathematischer Ausdruck "${expression}"`;
  }
}

/**
 * Remember handler - stores information in long-term memory
 * Uses request-scoped context for safe parallel execution
 *
 * Integrates with HiMeS Long-Term Memory layer to persist:
 * - User preferences
 * - Behavioral patterns
 * - Knowledge and expertise
 * - Goals and objectives
 * - Contextual information
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
 *
 * Retrieves relevant memories from:
 * - Episodic Memory: Past conversations and interactions
 * - Long-Term Memory: Stored facts, patterns, and significant interactions
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
  if (valence > 0.3) return 'positive Stimmung';
  if (valence < -0.3) return 'angespannt';
  return 'neutral';
}

// ===========================================
// Web Search & URL Fetch Handlers
// ===========================================

/**
 * Web search handler - searches the web for information
 * Uses Brave Search API (privacy-first) with DuckDuckGo fallback
 */
async function handleWebSearch(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const count = Math.min((input.count as number) || 5, 10);

  if (!query || typeof query !== 'string') {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  logger.debug('Tool: web_search', { query, count });

  try {
    const results = await searchWeb(query, { count });
    return formatSearchResults(results);
  } catch (error) {
    logger.error('Tool web_search failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der Websuche. Bitte versuche es erneut.';
  }
}

/**
 * Fetch URL handler - fetches and extracts content from a URL
 * Uses intelligent content extraction for readable output
 */
async function handleFetchUrl(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const url = input.url as string;

  if (!url || typeof url !== 'string') {
    return 'Fehler: Keine URL angegeben.';
  }

  if (!isValidUrl(url)) {
    return 'Fehler: Ungültige URL. Bitte eine vollständige URL mit http:// oder https:// angeben.';
  }

  logger.debug('Tool: fetch_url', { url });

  try {
    const result = await fetchUrl(url, { timeout: 15000, maxContentLength: 30000 });
    return formatForTool(result);
  } catch (error) {
    logger.error('Tool fetch_url failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der URL: ${url}`;
  }
}

// ===========================================
// GitHub Handlers
// ===========================================

/**
 * GitHub search repositories handler
 */
async function handleGitHubSearch(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const limit = Math.min((input.limit as number) || 5, 10);

  if (!query || typeof query !== 'string') {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert. Bitte GITHUB_PERSONAL_ACCESS_TOKEN setzen.';
  }

  logger.debug('Tool: github_search', { query, limit });

  try {
    const results = await github.searchRepositories(query, { limit });
    return github.formatSearchResults(results);
  } catch (error) {
    logger.error('Tool github_search failed', error instanceof Error ? error : undefined);
    return 'Fehler bei der GitHub-Suche. Bitte versuche es erneut.';
  }
}

/**
 * GitHub create issue handler
 */
async function handleGitHubCreateIssue(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;
  const title = input.title as string;
  const body = input.body as string | undefined;
  const labels = input.labels as string[] | undefined;

  if (!owner || !repo || !title) {
    return 'Fehler: owner, repo und title sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_create_issue', { owner, repo, title });

  try {
    const issue = await github.createIssue({ owner, repo, title, body, labels });
    return `✅ Issue erstellt:\n${github.formatIssue(issue)}`;
  } catch (error) {
    logger.error('Tool github_create_issue failed', error instanceof Error ? error : undefined);
    return `Fehler beim Erstellen des Issues: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

/**
 * GitHub repository info handler
 */
async function handleGitHubRepoInfo(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;

  if (!owner || !repo) {
    return 'Fehler: owner und repo sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_repo_info', { owner, repo });

  try {
    const repository = await github.getRepository(owner, repo);
    return github.formatRepository(repository);
  } catch (error) {
    logger.error('Tool github_repo_info failed', error instanceof Error ? error : undefined);
    return `Repository ${owner}/${repo} nicht gefunden oder kein Zugriff.`;
  }
}

/**
 * GitHub list issues handler
 */
async function handleGitHubListIssues(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;
  const state = (input.state as 'open' | 'closed' | 'all') || 'open';
  const limit = Math.min((input.limit as number) || 5, 20);

  if (!owner || !repo) {
    return 'Fehler: owner und repo sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_list_issues', { owner, repo, state, limit });

  try {
    const issues = await github.listIssues(owner, repo, { state, limit });

    if (issues.length === 0) {
      return `Keine ${state === 'all' ? '' : state + 'en'} Issues in ${owner}/${repo} gefunden.`;
    }

    const parts: string[] = [`**Issues in ${owner}/${repo}** (${state}):\n`];
    for (const issue of issues) {
      parts.push(github.formatIssue(issue));
      parts.push('');
    }
    return parts.join('\n');
  } catch (error) {
    logger.error('Tool github_list_issues failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der Issues.`;
  }
}

/**
 * GitHub PR summary handler
 */
async function handleGitHubPRSummary(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const owner = input.owner as string;
  const repo = input.repo as string;
  const prNumber = input.pr_number as number;

  if (!owner || !repo || !prNumber) {
    return 'Fehler: owner, repo und pr_number sind erforderlich.';
  }

  if (!github.isGitHubAvailable()) {
    return 'GitHub-Integration nicht konfiguriert.';
  }

  logger.debug('Tool: github_pr_summary', { owner, repo, prNumber });

  try {
    const pr = await github.getPullRequest(owner, repo, prNumber);
    const files = await github.getPullRequestFiles(owner, repo, prNumber);

    const parts: string[] = [github.formatPullRequest(pr), '\n**Geänderte Dateien:**'];

    for (const file of files.slice(0, 10)) {
      parts.push(`• ${file.filename} (+${file.additions}/-${file.deletions}) [${file.status}]`);
    }

    if (files.length > 10) {
      parts.push(`... und ${files.length - 10} weitere Dateien`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool github_pr_summary failed', error instanceof Error ? error : undefined);
    return `PR #${prNumber} in ${owner}/${repo} nicht gefunden.`;
  }
}

// ===========================================
// Project Context Handlers
// ===========================================

/**
 * Analyze project handler - provides comprehensive project analysis
 * Returns detailed information about project structure, dependencies, and patterns
 */
async function handleAnalyzeProject(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const projectPath = input.project_path as string;
  const includeReadme = input.include_readme !== 'false';

  if (!projectPath || typeof projectPath !== 'string') {
    return 'Fehler: Kein Projektpfad angegeben.';
  }

  logger.debug('Tool: analyze_project', { projectPath, includeReadme });

  try {
    const context = await projectContext.generateProjectContext(projectPath);

    // Build response
    const parts: string[] = [context.summary];

    if (context.keyFiles.length > 0) {
      parts.push('\n## Wichtige Dateien');
      parts.push(context.keyFiles.map((f) => `• ${f}`).join('\n'));
    }

    if (context.techStack.length > 0) {
      parts.push('\n## Tech Stack');
      parts.push(context.techStack.join(', '));
    }

    if (context.focusAreas.length > 0) {
      parts.push('\n## Empfohlene Fokus-Bereiche');
      parts.push(context.focusAreas.map((a) => `• ${a}`).join('\n'));
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool analyze_project failed', error instanceof Error ? error : undefined);
    return `Fehler beim Analysieren des Projekts: ${projectPath}. Stelle sicher, dass der Pfad existiert.`;
  }
}

/**
 * Get project summary handler - quick project overview
 */
async function handleProjectSummary(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const projectPath = input.project_path as string;

  if (!projectPath || typeof projectPath !== 'string') {
    return 'Fehler: Kein Projektpfad angegeben.';
  }

  logger.debug('Tool: get_project_summary', { projectPath });

  try {
    const summary = await projectContext.getQuickProjectSummary(projectPath);
    return summary;
  } catch (error) {
    logger.error('Tool get_project_summary failed', error instanceof Error ? error : undefined);
    return `Fehler: Projekt nicht gefunden unter ${projectPath}`;
  }
}

/**
 * List project files handler - get project file structure
 */
async function handleListProjectFiles(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const projectPath = input.project_path as string;
  const maxDepth = (input.max_depth as number) || 3;
  const filterExtension = input.filter_extension as string | undefined;

  if (!projectPath || typeof projectPath !== 'string') {
    return 'Fehler: Kein Projektpfad angegeben.';
  }

  logger.debug('Tool: list_project_files', { projectPath, maxDepth, filterExtension });

  try {
    const structure = await projectContext.scanProjectStructure(projectPath, maxDepth);

    let files = structure.files.filter((f) => f.type === 'file');

    // Filter by extension if specified
    if (filterExtension) {
      const ext = filterExtension.startsWith('.') ? filterExtension.slice(1) : filterExtension;
      files = files.filter((f) => f.extension === ext);
    }

    // Build tree-like output
    const parts: string[] = [
      `📁 **${structure.rootPath}**`,
      `📊 ${structure.totalFiles} Dateien, ${structure.totalDirectories} Verzeichnisse`,
      '',
    ];

    // Group files by directory
    const filesByDir: Record<string, projectContext.ProjectFile[]> = { '/': [] };

    for (const file of files) {
      const dir = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '/';
      if (!filesByDir[dir]) {
        filesByDir[dir] = [];
      }
      filesByDir[dir].push(file);
    }

    // Sort directories and output
    const sortedDirs = Object.keys(filesByDir).sort();

    for (const dir of sortedDirs.slice(0, 20)) {
      if (dir !== '/') {
        parts.push(`📂 ${dir}/`);
      }
      for (const file of filesByDir[dir].slice(0, 10)) {
        const indent = dir === '/' ? '' : '  ';
        const sizeStr = file.size ? ` (${formatFileSize(file.size)})` : '';
        parts.push(`${indent}📄 ${file.name}${sizeStr}`);
      }
      if (filesByDir[dir].length > 10) {
        parts.push(`  ... und ${filesByDir[dir].length - 10} weitere`);
      }
    }

    if (sortedDirs.length > 20) {
      parts.push(`\n... und ${sortedDirs.length - 20} weitere Verzeichnisse`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool list_project_files failed', error instanceof Error ? error : undefined);
    return `Fehler beim Lesen des Verzeichnisses: ${projectPath}`;
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  logger.info('Tool handlers registered', {
    tools: [
      'search_ideas',
      'create_idea',
      'get_related_ideas',
      'calculate',
      'remember',
      'recall',
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
         toolRegistry.has('analyze_project');
}
