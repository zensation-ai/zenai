/**
 * Dynamic Team Builder (Phase 130, Task 2)
 *
 * Selects and composes agent teams dynamically based on the user's goal.
 * Uses a specialist library of role profiles with trigger keywords and domains
 * to match the right agents to each goal.
 *
 * All exported functions are pure (no I/O, no async) for easy testing.
 *
 * @module services/agents/team-builder
 */

import { logger } from '../../utils/logger';
import { AGENT_ROLES, AgentRole } from './context-isolator';

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface TeamMember {
  /** Role identifier */
  role: string;
  /** Agent persona / system prompt seed */
  persona: string;
  /** Tools available to this agent */
  tools: string[];
  /** Execution order — lower number runs first */
  priority: number;
  /** Max tokens for this agent */
  tokenBudget: number;
}

export interface TeamComposition {
  /** Ordered list of agents (sorted by priority) */
  members: TeamMember[];
  /** How agents collaborate */
  workflow: 'sequential' | 'parallel' | 'debate';
  /** Human-readable time estimate */
  estimatedDuration: string;
  /** Explanation of why this team was chosen */
  reasoning: string;
}

export interface SpecialistProfile {
  /** Unique role identifier */
  role: string;
  /** Agent persona */
  persona: string;
  /** Tools this specialist can use */
  tools: string[];
  /** Max token budget */
  tokenBudget: number;
  /** Goal keywords that suggest this specialist */
  triggerKeywords: string[];
  /** Domains this specialist excels at */
  domains: string[];
}

// =============================================================================
// Specialist Library
// =============================================================================

export const SPECIALIST_LIBRARY: SpecialistProfile[] = [
  {
    role: 'data_analyst',
    persona:
      'Du analysierst Daten, findest Muster und erstellst Visualisierungen.',
    tools: ['execute_code', 'get_revenue_metrics', 'analyze_document'],
    tokenBudget: 10000,
    triggerKeywords: ['daten', 'analyse', 'statistik', 'trend', 'data', 'analytics', 'chart'],
    domains: ['finance'],
  },
  {
    role: 'email_coordinator',
    persona: 'Du verwaltest E-Mail-Kommunikation professionell und effizient.',
    tools: ['draft_email', 'ask_inbox', 'inbox_summary'],
    tokenBudget: 6000,
    triggerKeywords: ['email', 'mail', 'nachricht', 'antwort', 'reply', 'send'],
    domains: ['email'],
  },
  {
    role: 'project_manager',
    persona:
      'Du planst Projekte, erstellst Aufgaben und überwachst Fortschritt.',
    tools: ['create_calendar_event', 'list_calendar_events'],
    tokenBudget: 8000,
    triggerKeywords: [
      'projekt',
      'plan',
      'aufgabe',
      'deadline',
      'termin',
      'project',
      'task',
      'schedule',
    ],
    domains: ['personal', 'work'],
  },
  {
    role: 'finance_advisor',
    persona: 'Du berätst zu Finanzen, Budget und Geschäftskennzahlen.',
    tools: ['get_revenue_metrics', 'calculate', 'generate_business_report'],
    tokenBudget: 8000,
    triggerKeywords: [
      'finanzen',
      'budget',
      'umsatz',
      'kosten',
      'revenue',
      'finance',
      'money',
    ],
    domains: ['finance'],
  },
  {
    role: 'learning_coach',
    persona:
      'Du hilfst beim Lernen, erklärst Konzepte und erstellst Lernpläne.',
    tools: ['web_search', 'search_ideas', 'create_idea', 'remember'],
    tokenBudget: 8000,
    triggerKeywords: [
      'lernen',
      'verstehen',
      'erklär',
      'tutorial',
      'learn',
      'understand',
      'teach',
    ],
    domains: ['learning'],
  },
];

// =============================================================================
// Pure helper functions
// =============================================================================

/**
 * Score how well a specialist matches the given goal.
 * Counts case-insensitive keyword matches and normalises to [0, 1].
 */
export function scoreSpecialist(goal: string, specialist: SpecialistProfile): number {
  if (!goal || !specialist.triggerKeywords.length) {return 0;}

  const lowerGoal = goal.toLowerCase();
  let matchCount = 0;

  for (const keyword of specialist.triggerKeywords) {
    if (lowerGoal.includes(keyword.toLowerCase())) {
      matchCount += 1;
    }
  }

  if (matchCount === 0) {return 0;}
  // Normalise: score = matched / total keywords, capped at 1
  return Math.min(matchCount / specialist.triggerKeywords.length, 1);
}

/**
 * Convert a SpecialistProfile or AgentRole to a TeamMember.
 * AgentRole uses the `name` field as the role identifier.
 */
export function buildTeamMember(
  profile: SpecialistProfile | AgentRole,
  priority: number,
): TeamMember {
  // SpecialistProfile has `role`; AgentRole has `name` (normalise to lowercase)
  const role = 'role' in profile ? profile.role : (profile as AgentRole).name.toLowerCase();

  return {
    role,
    persona: profile.persona,
    tools: [...profile.tools],
    priority,
    tokenBudget: profile.tokenBudget,
  };
}

/**
 * Look up a specialist by role identifier.
 * Returns null when not found.
 */
export function getSpecialist(role: string): SpecialistProfile | null {
  return SPECIALIST_LIBRARY.find((s) => s.role === role) ?? null;
}

/**
 * Return a shallow copy of the specialist library.
 */
export function listAvailableSpecialists(): SpecialistProfile[] {
  return [...SPECIALIST_LIBRARY];
}

// =============================================================================
// Team selection logic
// =============================================================================

/** Estimated duration strings keyed by team size */
const DURATION_MAP: Record<number, string> = {
  1: '30-60 Sekunden',
  2: '1-2 Minuten',
  3: '2-4 Minuten',
};

/**
 * Dynamically select and compose an agent team for the given goal.
 *
 * @param goal   Natural-language description of what needs to be done
 * @param approach  'fast' (≤2 agents), 'thorough' (≤3 agents), 'creative' (2 agents + Writer debate)
 */
export function selectTeamForGoal(
  goal: string,
  approach: 'fast' | 'thorough' | 'creative' = 'fast',
): TeamComposition {
  logger.info('[TeamBuilder] Selecting team', { goal: goal.slice(0, 80), approach });

  // --- Score all specialists ---
  const scored = SPECIALIST_LIBRARY.map((specialist) => ({
    specialist,
    score: scoreSpecialist(goal, specialist),
  })).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // --- Determine max team size ---
  const maxSize = approach === 'thorough' ? 3 : 2;

  // --- Build selected specialists ---
  const selectedProfiles: Array<SpecialistProfile | AgentRole> = [];

  if (approach === 'creative') {
    // Creative: best matching specialist (if any) + Writer for debate
    if (scored.length > 0) {
      selectedProfiles.push(scored[0].specialist);
    }
    // Always add writer for creative/debate workflow
    selectedProfiles.push(AGENT_ROLES['writer']);
  } else {
    // fast / thorough: pick top-N scored specialists
    const topSpecialists = scored.slice(0, maxSize);
    for (const { specialist } of topSpecialists) {
      selectedProfiles.push(specialist);
    }
  }

  // --- Fallback: ensure at least one core role when no specialists matched ---
  if (selectedProfiles.length === 0) {
    selectedProfiles.push(AGENT_ROLES['researcher']);
    logger.debug('[TeamBuilder] No specialist matched — falling back to researcher');
  }

  // --- Convert to TeamMembers with priority ---
  const members: TeamMember[] = selectedProfiles.map((profile, index) =>
    buildTeamMember(profile, index + 1),
  );

  // --- Determine workflow ---
  const workflow: TeamComposition['workflow'] =
    approach === 'creative' ? 'debate' : 'sequential';

  // --- Build reasoning string ---
  const matchedRoles = members.map((m) => m.role).join(', ');
  const reasoning = buildReasoning(goal, matchedRoles, scored, approach);

  const duration = DURATION_MAP[members.length] ?? '2-4 Minuten';

  logger.info('[TeamBuilder] Team composed', {
    members: members.map((m) => m.role),
    workflow,
  });

  return { members, workflow, estimatedDuration: duration, reasoning };
}

// =============================================================================
// Internal helpers
// =============================================================================

function buildReasoning(
  goal: string,
  selectedRoles: string,
  scored: Array<{ specialist: SpecialistProfile; score: number }>,
  approach: string,
): string {
  if (scored.length === 0) {
    return `Kein spezialisierter Agent passend für "${goal.slice(0, 60)}". Fallback auf Researcher.`;
  }

  const topRole = scored[0].specialist.role;
  const scorePercent = Math.round(scored[0].score * 100);
  return (
    `Ziel passt am besten zu "${topRole}" (${scorePercent}% Keyword-Übereinstimmung). ` +
    `Team: ${selectedRoles}. Ansatz: ${approach}.`
  );
}
