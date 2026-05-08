/**
 * Phase 143: Natural Language Agent Builder
 *
 * Converts natural language descriptions into AgentBlueprint structures
 * using Claude for NL parsing, with validation and injection protection.
 *
 * @module services/agents/nl-agent-builder
 */

import type { AgentBlueprint } from './blueprint-registry';
import type { AgentCategory } from './built-in-agents';
import { generateClaudeResponse } from '../claude/core';
import { logger } from '../../utils/logger';

// ── Exported Interfaces ─────────────────────────────────────────────

export interface GeneratedBlueprint {
  blueprint: Partial<AgentBlueprint>;
  confidence: number;
  reasoning: string;
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TestRunResult {
  success: boolean;
  output: string;
  toolsUsed: string[];
  tokensUsed: number;
  executionTimeMs: number;
  issues: string[];
}

// ── Constants ───────────────────────────────────────────────────────

export const KNOWN_TOOLS = [
  'search_ideas', 'create_idea', 'update_idea', 'archive_idea', 'delete_idea',
  'get_related_ideas', 'calculate', 'remember', 'recall', 'memory_introspect',
  'memory_update', 'memory_delete', 'memory_update_profile', 'memory_rethink',
  'memory_restructure', 'memory_promote', 'memory_demote', 'memory_forget',
  'memory_replace', 'memory_abstract', 'memory_search_and_link',
  'core_memory_read', 'core_memory_update', 'core_memory_append',
  'web_search', 'fetch_url', 'github_search', 'github_create_issue',
  'github_repo_info', 'github_list_issues', 'github_pr_summary',
  'analyze_project', 'get_project_summary', 'list_project_files',
  'execute_code', 'analyze_document', 'search_documents', 'synthesize_knowledge',
  'create_document', 'prepare_document_context', 'create_meeting', 'navigate_to',
  'app_help', 'open_panel', 'get_revenue_metrics', 'get_traffic_analytics',
  'get_seo_performance', 'get_system_health', 'generate_business_report',
  'identify_anomalies', 'compare_periods', 'create_calendar_event',
  'list_calendar_events', 'draft_email', 'estimate_travel', 'get_directions',
  'get_opening_hours', 'find_nearby_places', 'optimize_day_route',
  'ask_inbox', 'inbox_summary', 'conversation_search', 'conversation_search_date',
  'mcp_call_tool', 'mcp_list_tools', 'draft_social_post',
];

const KNOWN_TOOLS_SET = new Set(KNOWN_TOOLS);

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above)\s+instructions/i,
  /you\s+are\s+now/i,
  /disregard\s+all\s+rules/i,
  /\[SYSTEM\]/i,
  /###\s*OVERRIDE/i,
  /forget\s+(everything|all)\s+(you|your)/i,
  /new\s+instructions?\s*:/i,
  /role[:\s]+play/i,
];

const VALID_CATEGORIES: AgentCategory[] = [
  'productivity', 'communication', 'research', 'finance', 'knowledge', 'development', 'custom',
];

const VALID_TYPES = ['autonomous', 'triggered', 'scheduled', 'hybrid'];

const TRIGGER_TYPES = [
  'schedule', 'email_received', 'calendar_soon', 'idea_created',
  'manual', 'webhook', 'event', 'pattern',
];

// ── Helpers ─────────────────────────────────────────────────────────

function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function buildSystemPrompt(): string {
  return `You are an agent blueprint generator for ZenAI. Given a natural language description of an agent, produce a JSON object with the following fields:

- name (string, required): Short name for the agent
- description (string): One-sentence description
- category (string): One of: ${VALID_CATEGORIES.join(', ')}
- type (string): One of: ${VALID_TYPES.join(', ')}
- tools (string[]): Subset of known tools: ${KNOWN_TOOLS.join(', ')}
- instructions (string): Detailed step-by-step instructions for the agent
- triggers (array of {type, config}): Trigger types: ${TRIGGER_TYPES.join(', ')}
- approvalRequired (boolean): Whether actions need user approval
- maxActionsPerDay (number): Daily action limit
- tokenBudgetDaily (number): Daily token budget
- defaultContext (string): One of: operations, finance, people, strategy
- tags (string[]): Relevant tags
- icon (string): Single emoji icon

Also include:
- confidence (number 0-1): How confident you are in the mapping
- reasoning (string): Brief explanation of your choices

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON.`;
}

function parseAIResponse(raw: string): Record<string, unknown> {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

// ── NLAgentBuilder ──────────────────────────────────────────────────

export class NLAgentBuilder {
  /**
   * Generate a blueprint from a natural language description.
   */
  async generateBlueprint(description: string, context: string = 'operations'): Promise<GeneratedBlueprint> {
    if (!description || description.trim().length === 0) {
      throw new Error('Description cannot be empty');
    }

    if (description.length > 2000) {
      throw new Error('Description exceeds maximum length of 2000 characters');
    }

    if (containsInjection(description)) {
      throw new Error('Description contains disallowed content patterns');
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = `Create an agent blueprint for the following description. Default context: ${context}\n\nDescription: ${description}`;

    const raw = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0.3,
    });

    const parsed = parseAIResponse(raw);
    const warnings: string[] = [];

    // Extract confidence and reasoning from AI response
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    const reasoning = typeof parsed.reasoning === 'string'
      ? parsed.reasoning
      : 'Generated from natural language description';

    // Build partial blueprint
    const blueprint: Partial<AgentBlueprint> = {
      name: typeof parsed.name === 'string' ? parsed.name : 'Unnamed Agent',
      description: typeof parsed.description === 'string' ? parsed.description : null,
      icon: typeof parsed.icon === 'string' ? parsed.icon : '🤖',
      category: VALID_CATEGORIES.includes(parsed.category as AgentCategory)
        ? (parsed.category as AgentCategory)
        : 'custom',
      type: VALID_TYPES.includes(parsed.type as string)
        ? (parsed.type as AgentBlueprint['type'])
        : 'triggered',
      tools: Array.isArray(parsed.tools)
        ? (parsed.tools as string[]).filter((t) => KNOWN_TOOLS_SET.has(t))
        : [],
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
      triggers: Array.isArray(parsed.triggers)
        ? (parsed.triggers as AgentBlueprint['triggers'])
        : [],
      approvalRequired: typeof parsed.approvalRequired === 'boolean'
        ? parsed.approvalRequired
        : false,
      maxActionsPerDay: typeof parsed.maxActionsPerDay === 'number'
        ? parsed.maxActionsPerDay
        : 10,
      tokenBudgetDaily: typeof parsed.tokenBudgetDaily === 'number'
        ? parsed.tokenBudgetDaily
        : 20000,
      defaultContext: typeof parsed.defaultContext === 'string'
        ? parsed.defaultContext
        : context,
      tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
      source: 'nl_generated' as const,
    };

    // Check for filtered-out tools
    if (Array.isArray(parsed.tools)) {
      const unknown = (parsed.tools as string[]).filter((t) => !KNOWN_TOOLS_SET.has(t));
      if (unknown.length > 0) {
        warnings.push(`Unknown tools removed: ${unknown.join(', ')}`);
      }
    }

    logger.info('Generated blueprint from NL', {
      name: blueprint.name,
      confidence,
      toolCount: blueprint.tools?.length,
    });

    return { blueprint, confidence, reasoning, warnings };
  }

  /**
   * Validate a (partial) blueprint for correctness and safety.
   */
  validateBlueprint(blueprint: Partial<AgentBlueprint>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!blueprint.id && blueprint.id !== undefined) {
      // id is only required if explicitly present but empty
    }
    if (!blueprint.name) {
      errors.push('Missing required field: name');
    }
    if (!blueprint.type) {
      errors.push('Missing required field: type');
    }
    if (!blueprint.tools || !Array.isArray(blueprint.tools) || blueprint.tools.length === 0) {
      errors.push('Missing required field: tools (must be a non-empty array)');
    }
    if (!blueprint.instructions) {
      errors.push('Missing required field: instructions');
    }

    // Tool allowlist check
    if (Array.isArray(blueprint.tools)) {
      const unknown = blueprint.tools.filter((t) => !KNOWN_TOOLS_SET.has(t));
      if (unknown.length > 0) {
        errors.push(`Unknown tools: ${unknown.join(', ')}`);
      }
    }

    // Instructions length
    if (blueprint.instructions && blueprint.instructions.length > 5000) {
      errors.push('Instructions exceed maximum length of 5000 characters');
    }

    // Instructions injection scan
    if (blueprint.instructions && containsInjection(blueprint.instructions)) {
      errors.push('Instructions contain disallowed content patterns');
    }

    // Token budget warning
    if (blueprint.tokenBudgetDaily !== undefined && blueprint.tokenBudgetDaily > 200000) {
      warnings.push(`Token budget (${blueprint.tokenBudgetDaily}) exceeds recommended maximum of 200,000`);
    }

    // Max actions warning
    if (blueprint.maxActionsPerDay !== undefined && blueprint.maxActionsPerDay > 50) {
      warnings.push(`Max actions per day (${blueprint.maxActionsPerDay}) exceeds recommended maximum of 50`);
    }

    // Approval warning for sensitive tools
    if (Array.isArray(blueprint.tools) && blueprint.approvalRequired === false) {
      const sensitiveTools = ['draft_email', 'draft_social_post'];
      const hasSensitive = blueprint.tools.some((t) => sensitiveTools.includes(t));
      if (hasSensitive) {
        warnings.push('Agent has email/social tools but approvalRequired is false — consider enabling approval');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Refine an existing blueprint based on user feedback.
   */
  async refineBlueprint(
    blueprint: Partial<AgentBlueprint>,
    feedback: string,
  ): Promise<Partial<AgentBlueprint>> {
    const systemPrompt = `You are an agent blueprint refiner for ZenAI. You will receive an existing blueprint as JSON and user feedback. Update the blueprint according to the feedback and return the updated JSON.

Known tools: ${KNOWN_TOOLS.join(', ')}
Valid categories: ${VALID_CATEGORIES.join(', ')}
Valid types: ${VALID_TYPES.join(', ')}

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON.`;

    const userPrompt = `Current blueprint:\n${JSON.stringify(blueprint, null, 2)}\n\nUser feedback: ${feedback}`;

    const raw = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0.3,
    });

    const parsed = parseAIResponse(raw);

    // Merge parsed result into blueprint, preserving source
    const refined: Partial<AgentBlueprint> = {
      ...blueprint,
      name: typeof parsed.name === 'string' ? parsed.name : blueprint.name,
      description: typeof parsed.description === 'string' ? parsed.description : blueprint.description,
      icon: typeof parsed.icon === 'string' ? parsed.icon : blueprint.icon,
      category: VALID_CATEGORIES.includes(parsed.category as AgentCategory)
        ? (parsed.category as AgentCategory)
        : blueprint.category,
      type: VALID_TYPES.includes(parsed.type as string)
        ? (parsed.type as AgentBlueprint['type'])
        : blueprint.type,
      tools: Array.isArray(parsed.tools)
        ? (parsed.tools as string[]).filter((t) => KNOWN_TOOLS_SET.has(t))
        : blueprint.tools,
      instructions: typeof parsed.instructions === 'string'
        ? parsed.instructions
        : blueprint.instructions,
      triggers: Array.isArray(parsed.triggers)
        ? (parsed.triggers as AgentBlueprint['triggers'])
        : blueprint.triggers,
      approvalRequired: typeof parsed.approvalRequired === 'boolean'
        ? parsed.approvalRequired
        : blueprint.approvalRequired,
      maxActionsPerDay: typeof parsed.maxActionsPerDay === 'number'
        ? parsed.maxActionsPerDay
        : blueprint.maxActionsPerDay,
      tokenBudgetDaily: typeof parsed.tokenBudgetDaily === 'number'
        ? parsed.tokenBudgetDaily
        : blueprint.tokenBudgetDaily,
      defaultContext: typeof parsed.defaultContext === 'string'
        ? parsed.defaultContext
        : blueprint.defaultContext,
      tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : blueprint.tags,
      source: blueprint.source ?? ('nl_generated' as const),
    };

    logger.info('Refined blueprint from feedback', { name: refined.name });

    return refined;
  }
}

export const nlAgentBuilder = new NLAgentBuilder();
