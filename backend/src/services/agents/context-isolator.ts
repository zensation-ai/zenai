/**
 * Context Isolator (Phase 129, Task 2)
 *
 * Creates isolated, role-appropriate contexts for each agent in a multi-agent
 * team. Reduces token waste and improves output quality by:
 * - Filtering context to only what each role needs
 * - Capping token budgets per role
 * - Injecting role-specific system prompts
 * - Passing filtered results from peer agents
 *
 * All functions are pure (no I/O, no async) for easy testing.
 *
 * @module services/agents/context-isolator
 */

import { logger } from '../../utils/logger';

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface IsolatedContext {
  /** Role-specific instructions (system prompt) */
  systemPrompt: string;
  /** Filtered context for this role */
  relevantContext: string;
  /** Only tools this agent is allowed to use */
  allowedTools: string[];
  /** Max tokens for this agent */
  tokenBudget: number;
  /** Results from other agents (filtered/truncated) */
  sharedResults: string[];
}

export interface AgentRole {
  /** Display name */
  name: string;
  /** Role description used as basis for system prompt */
  persona: string;
  /** Context section keywords to prioritize */
  focusAreas: string[];
  /** Context section keywords to filter out */
  excludeAreas: string[];
  /** Allowed tool names */
  tools: string[];
  /** Max token budget */
  tokenBudget: number;
}

// =============================================================================
// Pre-defined Roles
// =============================================================================

export const AGENT_ROLES: Record<string, AgentRole> = {
  researcher: {
    name: 'Researcher',
    persona:
      'Du bist ein gründlicher Recherche-Agent. Finde relevante Fakten, Quellen und Zusammenhänge.',
    focusAreas: ['rag', 'web_search', 'knowledge_graph', 'facts'],
    excludeAreas: ['email_drafts', 'calendar_details', 'style_preferences'],
    tools: ['web_search', 'fetch_url', 'search_ideas', 'recall', 'github_search'],
    tokenBudget: 12000,
  },
  writer: {
    name: 'Writer',
    persona: 'Du bist ein kreativer Schreib-Agent. Verfasse klare, gut strukturierte Texte.',
    focusAreas: ['style_preferences', 'user_profile', 'previous_drafts'],
    excludeAreas: ['raw_search_results', 'code_context', 'technical_details'],
    tools: ['create_idea', 'update_idea', 'draft_email'],
    tokenBudget: 8000,
  },
  reviewer: {
    name: 'Reviewer',
    persona:
      'Du bist ein kritischer Review-Agent. Prüfe Qualität, Korrektheit und Vollständigkeit.',
    focusAreas: ['facts', 'source_quality', 'consistency'],
    excludeAreas: ['style_preferences', 'calendar_details'],
    tools: ['search_ideas', 'recall', 'web_search'],
    tokenBudget: 6000,
  },
  coder: {
    name: 'Coder',
    persona:
      'Du bist ein erfahrener Programmier-Agent. Schreibe sauberen, getesteten Code.',
    focusAreas: ['code_context', 'project_structure', 'technical_docs'],
    excludeAreas: ['email_drafts', 'personal_facts', 'calendar_details'],
    tools: ['execute_code', 'analyze_project', 'get_project_summary', 'web_search', 'github_search'],
    tokenBudget: 10000,
  },
};

// =============================================================================
// Helpers
// =============================================================================

/** Rough token estimate: 1 token ≈ 3 characters */
const CHARS_PER_TOKEN = 3;

/** Max combined length for sharedResults */
const MAX_SHARED_RESULTS_CHARS = 2000;

/**
 * Split a context string into labeled sections.
 *
 * A section starts with a header line that is either:
 * - A bracket label:   `[section_name] …` (first non-whitespace char is `[`)
 * - A markdown header: `## Section Name` (starts with `#`)
 *
 * Returns an array of `{ header, body }` pairs. If no headers are found the
 * array will be empty.
 */
function splitIntoSections(context: string): Array<{ header: string; body: string }> {
  if (!context) return [];

  const lines = context.split('\n');
  const sections: Array<{ header: string; body: string }> = [];
  let current: { header: string; body: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const isSectionHeader =
      trimmed.startsWith('[') || trimmed.startsWith('#');

    if (isSectionHeader && trimmed.length > 1) {
      if (current !== null) {
        sections.push(current);
      }
      current = { header: trimmed.toLowerCase(), body: line + '\n' };
    } else {
      if (current !== null) {
        current.body += line + '\n';
      }
      // Lines before the first header are ignored (they become part of no section)
    }
  }

  if (current !== null) {
    sections.push(current);
  }

  return sections;
}

/** Normalise a section header for keyword matching */
function normaliseHeader(header: string): string {
  // Strip bracket/markdown markup and lowercase
  return header
    .replace(/^#+\s*/, '')   // ## Heading → heading
    .replace(/^\[/, '')       // [label] → label]
    .replace(/\].*$/, '')     // label] → label
    .trim()
    .toLowerCase();
}

/** Check whether a section header matches any of the given keywords */
function headerMatchesAny(header: string, keywords: string[]): boolean {
  const normalised = normaliseHeader(header);
  return keywords.some((kw) => normalised.includes(kw.toLowerCase()));
}

// =============================================================================
// Public API (pure functions)
// =============================================================================

/**
 * Look up a pre-defined agent role by name.
 *
 * @param roleName - e.g. 'researcher'
 * @returns The AgentRole, or null if not found.
 */
export function getAgentRole(
  roleName: string,
  agentRoles: Record<string, AgentRole> = AGENT_ROLES
): AgentRole | null {
  return agentRoles[roleName] ?? null;
}

/**
 * Return the list of tools allowed for a role.
 *
 * @returns Tool name array, or empty array for unknown role.
 */
export function getAllowedTools(
  roleName: string,
  agentRoles: Record<string, AgentRole> = AGENT_ROLES
): string[] {
  return agentRoles[roleName]?.tools ?? [];
}

/**
 * Filter a context string, keeping only sections that match includeAreas
 * and removing sections that match excludeAreas.
 *
 * Rules:
 * 1. Split context by section headers (`[…]` lines or `## …` lines).
 * 2. If no headers exist → return original context unchanged.
 * 3. If no sections match includeAreas → return original context unchanged
 *    (prevents an agent from receiving an empty context).
 * 4. Otherwise, include matching sections and exclude conflicting ones.
 *
 * @param context     - The full context string.
 * @param includeAreas - Keywords that a section header must contain to be kept.
 * @param excludeAreas - Keywords that cause a section to be removed.
 */
export function filterContextByAreas(
  context: string,
  includeAreas: string[],
  excludeAreas: string[]
): string {
  if (!context) return context;
  if (includeAreas.length === 0 && excludeAreas.length === 0) return context;

  const sections = splitIntoSections(context);

  // No recognised section structure → return as-is
  if (sections.length === 0) return context;

  // Determine which sections match the include keywords
  const includedSections = includeAreas.length > 0
    ? sections.filter((s) => headerMatchesAny(s.header, includeAreas))
    : sections;

  // If nothing matches includeAreas → return full context (fallback)
  if (includedSections.length === 0) return context;

  // Apply exclude filter
  const finalSections = excludeAreas.length > 0
    ? includedSections.filter((s) => !headerMatchesAny(s.header, excludeAreas))
    : includedSections;

  return finalSections.map((s) => s.body).join('');
}

/**
 * Build an isolated context object for a single agent role.
 *
 * @param role          - Role name (e.g. 'researcher').
 * @param fullContext   - The complete shared context string.
 * @param sharedResults - Results already produced by peer agents.
 * @param agentRoles    - Optional custom role map (defaults to AGENT_ROLES).
 */
export function buildIsolatedContext(
  role: string,
  fullContext: string,
  sharedResults: string[],
  agentRoles: Record<string, AgentRole> = AGENT_ROLES
): IsolatedContext {
  const agentRole = agentRoles[role];

  if (!agentRole) {
    logger.warn(`[ContextIsolator] Unknown role "${role}" — falling back to generic context`);

    return {
      systemPrompt: `Du bist ein hilfreicher KI-Agent. Bearbeite die gestellte Aufgabe sorgfältig.`,
      relevantContext: fullContext,
      allowedTools: [],
      tokenBudget: 8000,
      sharedResults: truncateSharedResults(sharedResults),
    };
  }

  logger.debug(`[ContextIsolator] Building context for role "${role}" (budget: ${agentRole.tokenBudget} tokens)`);

  // 1. Build system prompt
  const systemPrompt = agentRole.persona;

  // 2. Filter context to role-relevant sections
  const filteredContext = filterContextByAreas(
    fullContext,
    agentRole.focusAreas,
    agentRole.excludeAreas
  );

  // 3. Truncate to token budget (chars / 3 ≈ tokens)
  const maxChars = agentRole.tokenBudget * CHARS_PER_TOKEN;
  const relevantContext =
    filteredContext.length > maxChars
      ? filteredContext.slice(0, maxChars)
      : filteredContext;

  // 4. Truncate shared results
  const truncatedShared = truncateSharedResults(sharedResults);

  return {
    systemPrompt,
    relevantContext,
    allowedTools: [...agentRole.tools],
    tokenBudget: agentRole.tokenBudget,
    sharedResults: truncatedShared,
  };
}

/**
 * Build isolated contexts for every role in a team simultaneously.
 * Each agent starts with an empty sharedResults array — the caller is
 * responsible for filling in peer results as agents complete their work.
 *
 * @param roles       - Role names to build contexts for.
 * @param fullContext - The full shared context string.
 * @param agentRoles  - Optional custom role map.
 */
export function buildTeamContexts(
  roles: string[],
  fullContext: string,
  agentRoles: Record<string, AgentRole> = AGENT_ROLES
): Record<string, IsolatedContext> {
  const result: Record<string, IsolatedContext> = {};

  for (const role of roles) {
    result[role] = buildIsolatedContext(role, fullContext, [], agentRoles);
  }

  logger.info(`[ContextIsolator] Built isolated contexts for team: [${roles.join(', ')}]`);

  return result;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Truncate the combined shared-results array so the total character count
 * stays within MAX_SHARED_RESULTS_CHARS.
 */
function truncateSharedResults(results: string[]): string[] {
  if (results.length === 0) return [];

  const truncated: string[] = [];
  let remaining = MAX_SHARED_RESULTS_CHARS;

  for (const result of results) {
    if (remaining <= 0) break;
    if (result.length <= remaining) {
      truncated.push(result);
      remaining -= result.length;
    } else {
      truncated.push(result.slice(0, remaining));
      remaining = 0;
    }
  }

  return truncated;
}
