/**
 * Agent Specialization Profiles
 *
 * Learnable profiles per agent type that evolve based on
 * successful execution patterns.
 *
 * @module services/agents/agent-specialization
 */

import { pool } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export interface AgentSpecializations {
  preferred_sources?: string[];
  style_preferences?: string[];
  language_preferences?: string[];
  focus_areas?: string[];
}

export interface AgentProfile {
  agent_role: string;
  specializations: AgentSpecializations;
  learned_from_executions: number;
  last_updated: string;
}

// ===========================================
// Default Specializations
// ===========================================

const DEFAULT_SPECIALIZATIONS: Record<string, AgentSpecializations> = {
  researcher: {
    preferred_sources: ['web', 'docs', 'memory'],
    focus_areas: ['accuracy', 'breadth'],
  },
  writer: {
    style_preferences: ['clear', 'structured'],
    focus_areas: ['readability', 'coherence'],
  },
  coder: {
    language_preferences: ['typescript', 'python'],
    focus_areas: ['correctness', 'performance'],
  },
  reviewer: {
    focus_areas: ['quality', 'completeness', 'accuracy'],
  },
};

// ===========================================
// Profile Management
// ===========================================

/**
 * Get the specialization profile for an agent role.
 * Creates a default profile if none exists.
 */
export async function getProfile(agentRole: string): Promise<AgentProfile> {
  try {
    const result = await pool.query(
      `SELECT agent_role, specializations, learned_from_executions, last_updated
       FROM agent_specialization_profiles
       WHERE agent_role = $1`,
      [agentRole]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        agent_role: row.agent_role,
        specializations: row.specializations as AgentSpecializations,
        learned_from_executions: parseInt(row.learned_from_executions, 10),
        last_updated: row.last_updated,
      };
    }

    // Return default profile (not persisted yet)
    return {
      agent_role: agentRole,
      specializations: DEFAULT_SPECIALIZATIONS[agentRole] ?? {},
      learned_from_executions: 0,
      last_updated: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Failed to get agent profile', error instanceof Error ? error : undefined);
    return {
      agent_role: agentRole,
      specializations: DEFAULT_SPECIALIZATIONS[agentRole] ?? {},
      learned_from_executions: 0,
      last_updated: new Date().toISOString(),
    };
  }
}

/**
 * Get all stored profiles.
 */
export async function listProfiles(): Promise<AgentProfile[]> {
  try {
    const result = await pool.query(
      `SELECT agent_role, specializations, learned_from_executions, last_updated
       FROM agent_specialization_profiles
       ORDER BY agent_role`
    );

    return result.rows.map((row) => ({
      agent_role: row.agent_role,
      specializations: row.specializations as AgentSpecializations,
      learned_from_executions: parseInt(row.learned_from_executions, 10),
      last_updated: row.last_updated,
    }));
  } catch (error) {
    logger.error('Failed to list profiles', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Learn from a successful execution and update the agent's profile.
 */
export async function updateFromExecution(
  agentRole: string,
  executionData: Record<string, unknown>
): Promise<AgentProfile> {
  try {
    const current = await getProfile(agentRole);
    const updated = { ...current.specializations };

    // Extract learnings from execution data
    if (executionData.tools_used && Array.isArray(executionData.tools_used)) {
      const tools = executionData.tools_used as string[];
      // Infer preferred sources for researchers
      if (agentRole === 'researcher') {
        const sources = new Set(updated.preferred_sources ?? []);
        if (tools.includes('web_search')) {sources.add('web');}
        if (tools.includes('search_ideas') || tools.includes('recall')) {sources.add('memory');}
        if (tools.includes('search_documents') || tools.includes('analyze_document')) {sources.add('docs');}
        updated.preferred_sources = Array.from(sources);
      }

      // Infer language preferences for coders
      if (agentRole === 'coder') {
        const langs = new Set(updated.language_preferences ?? []);
        if (tools.includes('execute_code')) {
          const lang = executionData.language as string | undefined;
          if (lang) {langs.add(lang);}
        }
        updated.language_preferences = Array.from(langs);
      }
    }

    // Extract style preferences from metadata
    if (executionData.style && typeof executionData.style === 'string') {
      const styles = new Set(updated.style_preferences ?? []);
      styles.add(executionData.style);
      updated.style_preferences = Array.from(styles).slice(0, 10); // cap at 10
    }

    // Extract focus areas from metadata
    if (executionData.focus_area && typeof executionData.focus_area === 'string') {
      const areas = new Set(updated.focus_areas ?? []);
      areas.add(executionData.focus_area);
      updated.focus_areas = Array.from(areas).slice(0, 10);
    }

    // Persist to DB
    const result = await pool.query(
      `INSERT INTO agent_specialization_profiles
        (agent_role, specializations, learned_from_executions, last_updated)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (agent_role) DO UPDATE SET
         specializations = $2,
         learned_from_executions = agent_specialization_profiles.learned_from_executions + 1,
         last_updated = NOW()
       RETURNING agent_role, specializations, learned_from_executions, last_updated`,
      [agentRole, JSON.stringify(updated)]
    );

    const row = result.rows[0];

    logger.info('Agent profile updated from execution', {
      agentRole,
      learnedFrom: row.learned_from_executions,
    });

    return {
      agent_role: row.agent_role,
      specializations: row.specializations as AgentSpecializations,
      learned_from_executions: parseInt(row.learned_from_executions, 10),
      last_updated: row.last_updated,
    };
  } catch (error) {
    logger.error('Failed to update profile from execution', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Generate a system prompt addendum based on the agent's specialization profile.
 */
export async function getSpecializationPrompt(agentRole: string): Promise<string> {
  const profile = await getProfile(agentRole);
  const parts: string[] = [];

  const spec = profile.specializations;

  if (spec.preferred_sources && spec.preferred_sources.length > 0) {
    parts.push(`Preferred information sources: ${spec.preferred_sources.join(', ')}.`);
  }

  if (spec.style_preferences && spec.style_preferences.length > 0) {
    parts.push(`Writing style preferences: ${spec.style_preferences.join(', ')}.`);
  }

  if (spec.language_preferences && spec.language_preferences.length > 0) {
    parts.push(`Preferred programming languages: ${spec.language_preferences.join(', ')}.`);
  }

  if (spec.focus_areas && spec.focus_areas.length > 0) {
    parts.push(`Key focus areas: ${spec.focus_areas.join(', ')}.`);
  }

  if (profile.learned_from_executions > 0) {
    parts.push(`Profile refined from ${profile.learned_from_executions} successful executions.`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `\n[AGENT SPECIALIZATION]\n${parts.join('\n')}`;
}
