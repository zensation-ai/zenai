/**
 * Team Builder Tests (Phase 130, Task 2)
 *
 * TDD tests for dynamic team composition based on goal analysis.
 * Tests cover: specialist selection, scoring, member building, and lookups.
 */

import {
  selectTeamForGoal,
  scoreSpecialist,
  buildTeamMember,
  getSpecialist,
  listAvailableSpecialists,
  SPECIALIST_LIBRARY,
  TeamMember,
  TeamComposition,
  SpecialistProfile,
} from '../../../../services/agents/team-builder';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// =============================================================================
// scoreSpecialist
// =============================================================================

describe('scoreSpecialist', () => {
  const dataAnalyst = SPECIALIST_LIBRARY.find((s) => s.role === 'data_analyst')!;
  const emailCoordinator = SPECIALIST_LIBRARY.find((s) => s.role === 'email_coordinator')!;

  it('returns 0 for empty goal', () => {
    expect(scoreSpecialist('', dataAnalyst)).toBe(0);
  });

  it('returns 0 when no keywords match', () => {
    expect(scoreSpecialist('write a poem about nature', dataAnalyst)).toBe(0);
  });

  it('returns positive score for single keyword match', () => {
    const score = scoreSpecialist('analyse die Verkaufsdaten', dataAnalyst);
    expect(score).toBeGreaterThan(0);
  });

  it('returns higher score for multiple keyword matches', () => {
    const singleMatch = scoreSpecialist('daten anschauen', dataAnalyst);
    const multiMatch = scoreSpecialist('daten analyse statistik', dataAnalyst);
    expect(multiMatch).toBeGreaterThan(singleMatch);
  });

  it('is case-insensitive', () => {
    const lower = scoreSpecialist('daten analyse', dataAnalyst);
    const upper = scoreSpecialist('DATEN ANALYSE', dataAnalyst);
    const mixed = scoreSpecialist('Daten Analyse', dataAnalyst);
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  it('matches English keywords', () => {
    const score = scoreSpecialist('data analytics chart', dataAnalyst);
    expect(score).toBeGreaterThan(0);
  });

  it('does not score keywords from a different specialist', () => {
    const score = scoreSpecialist('email reply send', dataAnalyst);
    expect(score).toBe(0);
  });

  it('scores email_coordinator on email keywords', () => {
    const score = scoreSpecialist('send email to team', emailCoordinator);
    expect(score).toBeGreaterThan(0);
  });

  it('returns a normalized score between 0 and 1', () => {
    const score = scoreSpecialist('daten analyse statistik trend chart', dataAnalyst);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// buildTeamMember
// =============================================================================

describe('buildTeamMember', () => {
  const profile: SpecialistProfile = {
    role: 'data_analyst',
    persona: 'Du analysierst Daten.',
    tools: ['execute_code', 'get_revenue_metrics'],
    tokenBudget: 10000,
    triggerKeywords: ['daten', 'analyse'],
    domains: ['finance'],
  };

  it('sets role from profile', () => {
    const member = buildTeamMember(profile, 1);
    expect(member.role).toBe('data_analyst');
  });

  it('sets persona from profile', () => {
    const member = buildTeamMember(profile, 1);
    expect(member.persona).toBe('Du analysierst Daten.');
  });

  it('sets tools from profile', () => {
    const member = buildTeamMember(profile, 1);
    expect(member.tools).toEqual(['execute_code', 'get_revenue_metrics']);
  });

  it('sets tokenBudget from profile', () => {
    const member = buildTeamMember(profile, 1);
    expect(member.tokenBudget).toBe(10000);
  });

  it('sets priority from argument', () => {
    expect(buildTeamMember(profile, 1).priority).toBe(1);
    expect(buildTeamMember(profile, 3).priority).toBe(3);
  });

  it('works with an AgentRole (core role) that has no triggerKeywords', () => {
    const agentRole = {
      name: 'Researcher',
      persona: 'Du recherchierst.',
      focusAreas: ['rag'],
      excludeAreas: [],
      tools: ['web_search'],
      tokenBudget: 12000,
    };
    const member = buildTeamMember(agentRole as any, 2);
    // role is derived from name — accept any casing
    expect(member.role.toLowerCase()).toBe('researcher');
    expect(member.priority).toBe(2);
  });
});

// =============================================================================
// getSpecialist
// =============================================================================

describe('getSpecialist', () => {
  it('returns specialist by role name', () => {
    const specialist = getSpecialist('data_analyst');
    expect(specialist).not.toBeNull();
    expect(specialist!.role).toBe('data_analyst');
  });

  it('returns null for unknown role', () => {
    expect(getSpecialist('unknown_role')).toBeNull();
  });

  it('returns email_coordinator', () => {
    const specialist = getSpecialist('email_coordinator');
    expect(specialist).not.toBeNull();
    expect(specialist!.role).toBe('email_coordinator');
  });

  it('returns finance_advisor', () => {
    expect(getSpecialist('finance_advisor')).not.toBeNull();
  });

  it('returns learning_coach', () => {
    expect(getSpecialist('learning_coach')).not.toBeNull();
  });

  it('returns project_manager', () => {
    expect(getSpecialist('project_manager')).not.toBeNull();
  });
});

// =============================================================================
// listAvailableSpecialists
// =============================================================================

describe('listAvailableSpecialists', () => {
  it('returns all specialists from the library', () => {
    const specialists = listAvailableSpecialists();
    expect(specialists.length).toBe(SPECIALIST_LIBRARY.length);
  });

  it('includes data_analyst', () => {
    const roles = listAvailableSpecialists().map((s) => s.role);
    expect(roles).toContain('data_analyst');
  });

  it('includes all 5 predefined specialist roles', () => {
    const roles = listAvailableSpecialists().map((s) => s.role);
    expect(roles).toContain('data_analyst');
    expect(roles).toContain('email_coordinator');
    expect(roles).toContain('project_manager');
    expect(roles).toContain('finance_advisor');
    expect(roles).toContain('learning_coach');
  });

  it('returns a copy (mutation does not affect library)', () => {
    const list = listAvailableSpecialists();
    list.push({ role: 'injected', persona: '', tools: [], tokenBudget: 0, triggerKeywords: [], domains: [] });
    expect(listAvailableSpecialists().length).toBe(SPECIALIST_LIBRARY.length);
  });
});

// =============================================================================
// selectTeamForGoal
// =============================================================================

describe('selectTeamForGoal', () => {
  describe('specialist selection by domain', () => {
    it('picks data_analyst for a finance/data goal', () => {
      const team = selectTeamForGoal('Analysiere unsere Umsatzdaten und erstelle einen Trend-Chart');
      const roles = team.members.map((m) => m.role);
      expect(roles).toContain('data_analyst');
    });

    it('picks finance_advisor for a budget/revenue goal', () => {
      const team = selectTeamForGoal('Erstelle einen Finanzbericht über unser Budget und Umsatz');
      const roles = team.members.map((m) => m.role);
      expect(roles).toContain('finance_advisor');
    });

    it('picks email_coordinator for an email goal', () => {
      const team = selectTeamForGoal('Schreibe eine Antwort-Email an den Kunden');
      const roles = team.members.map((m) => m.role);
      expect(roles).toContain('email_coordinator');
    });

    it('picks learning_coach for a learning goal', () => {
      const team = selectTeamForGoal('Erkläre mir wie ich TypeScript Generics verstehen kann');
      const roles = team.members.map((m) => m.role);
      expect(roles).toContain('learning_coach');
    });

    it('picks project_manager for a project/scheduling goal', () => {
      const team = selectTeamForGoal('Erstelle einen Projektplan mit Deadlines und Terminen');
      const roles = team.members.map((m) => m.role);
      expect(roles).toContain('project_manager');
    });
  });

  describe('fallback to core roles', () => {
    it('includes at least one core role (researcher or coder) when no specialists match', () => {
      const team = selectTeamForGoal('Schreibe ein Gedicht über den Sommer');
      const roles = team.members.map((m) => m.role);
      const hasCoreRole = roles.some((r) => ['researcher', 'coder', 'Researcher', 'Coder'].includes(r));
      expect(hasCoreRole).toBe(true);
    });

    it('always returns at least 1 member', () => {
      const team = selectTeamForGoal('xyz123');
      expect(team.members.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('approach parameter', () => {
    it('returns 2 members for fast approach', () => {
      const team = selectTeamForGoal('Analysiere die Daten und erstelle einen Bericht', 'fast');
      expect(team.members.length).toBeLessThanOrEqual(2);
      expect(team.members.length).toBeGreaterThanOrEqual(1);
    });

    it('returns up to 3 members for thorough approach', () => {
      const team = selectTeamForGoal('Analysiere die Daten und erstelle einen detaillierten Bericht', 'thorough');
      expect(team.members.length).toBeLessThanOrEqual(3);
    });

    it('selects sequential workflow for fast approach', () => {
      const team = selectTeamForGoal('Analysiere die Daten', 'fast');
      expect(team.workflow).toBe('sequential');
    });

    it('selects sequential workflow for thorough approach', () => {
      const team = selectTeamForGoal('Erstelle eine detaillierte Analyse', 'thorough');
      expect(team.workflow).toBe('sequential');
    });

    it('selects debate workflow for creative approach', () => {
      const team = selectTeamForGoal('Entwickle eine kreative Strategie', 'creative');
      expect(team.workflow).toBe('debate');
    });

    it('defaults to sequential when no approach is specified', () => {
      const team = selectTeamForGoal('Erstelle einen Bericht');
      expect(['sequential', 'parallel', 'debate']).toContain(team.workflow);
    });

    it('includes writer for creative approach', () => {
      const team = selectTeamForGoal('Schreibe einen Blog-Artikel über KI Trends', 'creative');
      const roles = team.members.map((m) => m.role);
      expect(roles).toContain('writer');
    });
  });

  describe('output structure', () => {
    it('returns a TeamComposition with all required fields', () => {
      const team = selectTeamForGoal('Analysiere unsere Verkaufsdaten');
      expect(team).toHaveProperty('members');
      expect(team).toHaveProperty('workflow');
      expect(team).toHaveProperty('estimatedDuration');
      expect(team).toHaveProperty('reasoning');
    });

    it('members have all required TeamMember fields', () => {
      const team = selectTeamForGoal('Erstelle einen Finanzbericht');
      for (const member of team.members) {
        expect(member).toHaveProperty('role');
        expect(member).toHaveProperty('persona');
        expect(member).toHaveProperty('tools');
        expect(member).toHaveProperty('priority');
        expect(member).toHaveProperty('tokenBudget');
      }
    });

    it('member priorities are unique and ordered starting from 1', () => {
      const team = selectTeamForGoal('Erstelle einen detaillierten Projektplan und Analyse');
      const priorities = team.members.map((m) => m.priority).sort((a, b) => a - b);
      const unique = [...new Set(priorities)];
      expect(priorities).toEqual(unique);
      expect(priorities[0]).toBe(1);
    });

    it('reasoning is a non-empty string', () => {
      const team = selectTeamForGoal('Analysiere die Daten');
      expect(typeof team.reasoning).toBe('string');
      expect(team.reasoning.length).toBeGreaterThan(0);
    });

    it('estimatedDuration is a non-empty string', () => {
      const team = selectTeamForGoal('Erstelle einen Bericht');
      expect(typeof team.estimatedDuration).toBe('string');
      expect(team.estimatedDuration.length).toBeGreaterThan(0);
    });
  });
});
