/**
 * Context Isolator Tests (Phase 129, Task 2)
 *
 * Tests for building role-specific, isolated contexts for each agent
 * in a multi-agent team — reducing token waste and improving output quality.
 */

import {
  buildIsolatedContext,
  filterContextByAreas,
  getAgentRole,
  getAllowedTools,
  buildTeamContexts,
  AGENT_ROLES,
  IsolatedContext,
  AgentRole,
} from '../../../../services/agents/context-isolator';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_CONTEXT = `
[rag] Relevant documents from the knowledge base about TypeScript best practices.
TypeScript uses structural typing and supports generics.

[web_search] Search results from the web about Node.js performance.
Node.js uses a single-threaded event loop with libuv.

[email_drafts] Draft email to the team about the new deployment.
Subject: Deployment Update — please review.

[calendar_details] Meeting tomorrow at 10am with the design team.
Agenda: discuss new UI mockups.

[style_preferences] The user prefers concise, direct communication.
Use bullet points when listing multiple items.

[code_context] Repository structure: src/services, src/routes, src/utils.
Main entry point is backend/src/main.ts.

[facts] The project uses React on the frontend and Express on the backend.
Database is PostgreSQL with pgvector extension.

[technical_docs] API documentation for the authentication module.
JWT tokens expire after 15 minutes.
`;

const MARKDOWN_CONTEXT = `
## RAG Results
Documents retrieved from vector store about machine learning.

## Web Search
Recent articles on transformer architectures.

## Email Drafts
Draft for client follow-up.

## Calendar Details
Weekly sync on Friday at 2pm.

## Style Preferences
Formal tone for external communications.

## Code Context
Project uses TypeScript strict mode.

## Facts
The team has 5 developers and 2 designers.

## Technical Docs
REST API follows OpenAPI 3.0 specification.
`;

const EMPTY_CONTEXT = '';
const NO_SECTION_CONTEXT = 'This context has no section headers at all. It is just plain text.';

// ---------------------------------------------------------------------------
// AGENT_ROLES: all 4 roles defined with required fields
// ---------------------------------------------------------------------------

describe('AGENT_ROLES', () => {
  it('defines all 4 required roles', () => {
    expect(AGENT_ROLES).toHaveProperty('researcher');
    expect(AGENT_ROLES).toHaveProperty('writer');
    expect(AGENT_ROLES).toHaveProperty('reviewer');
    expect(AGENT_ROLES).toHaveProperty('coder');
  });

  it.each(['researcher', 'writer', 'reviewer', 'coder'] as const)(
    '%s role has all required fields',
    (roleName) => {
      const role = AGENT_ROLES[roleName];
      expect(role).toHaveProperty('name');
      expect(role).toHaveProperty('persona');
      expect(role).toHaveProperty('focusAreas');
      expect(role).toHaveProperty('excludeAreas');
      expect(role).toHaveProperty('tools');
      expect(role).toHaveProperty('tokenBudget');
      expect(typeof role.name).toBe('string');
      expect(typeof role.persona).toBe('string');
      expect(Array.isArray(role.focusAreas)).toBe(true);
      expect(Array.isArray(role.excludeAreas)).toBe(true);
      expect(Array.isArray(role.tools)).toBe(true);
      expect(typeof role.tokenBudget).toBe('number');
    }
  );

  it('researcher has correct tokenBudget', () => {
    expect(AGENT_ROLES.researcher.tokenBudget).toBe(12000);
  });

  it('writer has correct tokenBudget', () => {
    expect(AGENT_ROLES.writer.tokenBudget).toBe(8000);
  });

  it('reviewer has correct tokenBudget', () => {
    expect(AGENT_ROLES.reviewer.tokenBudget).toBe(6000);
  });

  it('coder has correct tokenBudget', () => {
    expect(AGENT_ROLES.coder.tokenBudget).toBe(10000);
  });

  it('researcher includes web_search in tools', () => {
    expect(AGENT_ROLES.researcher.tools).toContain('web_search');
  });

  it('writer includes draft_email in tools', () => {
    expect(AGENT_ROLES.writer.tools).toContain('draft_email');
  });

  it('coder includes execute_code in tools', () => {
    expect(AGENT_ROLES.coder.tools).toContain('execute_code');
  });

  it('reviewer includes recall in tools', () => {
    expect(AGENT_ROLES.reviewer.tools).toContain('recall');
  });
});

// ---------------------------------------------------------------------------
// getAgentRole
// ---------------------------------------------------------------------------

describe('getAgentRole', () => {
  it('returns the researcher role by name', () => {
    const role = getAgentRole('researcher');
    expect(role).not.toBeNull();
    expect(role!.name).toBe('Researcher');
  });

  it('returns the writer role by name', () => {
    const role = getAgentRole('writer');
    expect(role).not.toBeNull();
    expect(role!.name).toBe('Writer');
  });

  it('returns the reviewer role by name', () => {
    const role = getAgentRole('reviewer');
    expect(role).not.toBeNull();
    expect(role!.name).toBe('Reviewer');
  });

  it('returns the coder role by name', () => {
    const role = getAgentRole('coder');
    expect(role).not.toBeNull();
    expect(role!.name).toBe('Coder');
  });

  it('returns null for an unknown role', () => {
    expect(getAgentRole('unknown_role')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getAgentRole('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAllowedTools
// ---------------------------------------------------------------------------

describe('getAllowedTools', () => {
  it('returns researcher tools', () => {
    const tools = getAllowedTools('researcher');
    expect(tools).toContain('web_search');
    expect(tools).toContain('fetch_url');
    expect(tools).toContain('search_ideas');
    expect(tools).toContain('recall');
    expect(tools).toContain('github_search');
  });

  it('returns writer tools', () => {
    const tools = getAllowedTools('writer');
    expect(tools).toContain('create_idea');
    expect(tools).toContain('update_idea');
    expect(tools).toContain('draft_email');
  });

  it('returns reviewer tools', () => {
    const tools = getAllowedTools('reviewer');
    expect(tools).toContain('search_ideas');
    expect(tools).toContain('recall');
    expect(tools).toContain('web_search');
  });

  it('returns coder tools', () => {
    const tools = getAllowedTools('coder');
    expect(tools).toContain('execute_code');
    expect(tools).toContain('analyze_project');
    expect(tools).toContain('github_search');
  });

  it('returns empty array for unknown role', () => {
    expect(getAllowedTools('unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterContextByAreas
// ---------------------------------------------------------------------------

describe('filterContextByAreas', () => {
  it('includes sections matching includeAreas', () => {
    const result = filterContextByAreas(SAMPLE_CONTEXT, ['rag', 'facts'], []);
    expect(result).toContain('TypeScript uses structural typing');
    expect(result).toContain('The project uses React');
  });

  it('excludes sections matching excludeAreas', () => {
    const result = filterContextByAreas(
      SAMPLE_CONTEXT,
      ['rag', 'facts', 'email_drafts'],
      ['email_drafts']
    );
    expect(result).not.toContain('Draft email to the team');
    expect(result).toContain('TypeScript uses structural typing');
  });

  it('returns full context when no sections match includeAreas', () => {
    const result = filterContextByAreas(SAMPLE_CONTEXT, ['nonexistent_area'], []);
    expect(result).toBe(SAMPLE_CONTEXT);
  });

  it('handles markdown-style ## headers', () => {
    const result = filterContextByAreas(MARKDOWN_CONTEXT, ['rag', 'facts'], []);
    expect(result).toContain('Documents retrieved from vector store');
    expect(result).toContain('The team has 5 developers');
  });

  it('excludes markdown sections matching excludeAreas', () => {
    const result = filterContextByAreas(
      MARKDOWN_CONTEXT,
      ['rag', 'calendar_details'],
      ['calendar_details']
    );
    expect(result).not.toContain('Weekly sync on Friday');
    expect(result).toContain('Documents retrieved from vector store');
  });

  it('returns full context when input has no section headers', () => {
    const result = filterContextByAreas(NO_SECTION_CONTEXT, ['facts'], []);
    expect(result).toBe(NO_SECTION_CONTEXT);
  });

  it('returns empty string for empty context', () => {
    const result = filterContextByAreas(EMPTY_CONTEXT, ['facts'], []);
    expect(result).toBe(EMPTY_CONTEXT);
  });

  it('handles empty includeAreas by returning full context', () => {
    const result = filterContextByAreas(SAMPLE_CONTEXT, [], []);
    expect(result).toBe(SAMPLE_CONTEXT);
  });
});

// ---------------------------------------------------------------------------
// buildIsolatedContext
// ---------------------------------------------------------------------------

describe('buildIsolatedContext', () => {
  it('builds correct system prompt from researcher persona', () => {
    const ctx = buildIsolatedContext('researcher', SAMPLE_CONTEXT, []);
    expect(ctx.systemPrompt).toContain('Recherche-Agent');
  });

  it('builds correct system prompt from writer persona', () => {
    const ctx = buildIsolatedContext('writer', SAMPLE_CONTEXT, []);
    expect(ctx.systemPrompt).toContain('Schreib-Agent');
  });

  it('builds correct system prompt from coder persona', () => {
    const ctx = buildIsolatedContext('coder', SAMPLE_CONTEXT, []);
    expect(ctx.systemPrompt).toContain('Programmier-Agent');
  });

  it('includes researcher-relevant context (rag, facts)', () => {
    const ctx = buildIsolatedContext('researcher', SAMPLE_CONTEXT, []);
    expect(ctx.relevantContext).toContain('TypeScript uses structural typing');
  });

  it('excludes email_drafts from researcher context', () => {
    const ctx = buildIsolatedContext('researcher', SAMPLE_CONTEXT, []);
    expect(ctx.relevantContext).not.toContain('Draft email to the team');
  });

  it('includes style_preferences for writer context', () => {
    const ctx = buildIsolatedContext('writer', SAMPLE_CONTEXT, []);
    expect(ctx.relevantContext).toContain('concise, direct communication');
  });

  it('excludes raw_search_results from writer context', () => {
    const ctx = buildIsolatedContext('writer', SAMPLE_CONTEXT, []);
    // web_search maps to raw_search_results exclusion
    expect(ctx.relevantContext).not.toContain('Node.js uses a single-threaded event loop');
  });

  it('includes code_context for coder context', () => {
    const ctx = buildIsolatedContext('coder', SAMPLE_CONTEXT, []);
    expect(ctx.relevantContext).toContain('Repository structure');
  });

  it('excludes email_drafts from coder context', () => {
    const ctx = buildIsolatedContext('coder', SAMPLE_CONTEXT, []);
    expect(ctx.relevantContext).not.toContain('Draft email to the team');
  });

  it('returns correct allowedTools for researcher', () => {
    const ctx = buildIsolatedContext('researcher', SAMPLE_CONTEXT, []);
    expect(ctx.allowedTools).toContain('web_search');
    expect(ctx.allowedTools).toContain('recall');
    expect(ctx.allowedTools).not.toContain('execute_code');
  });

  it('returns correct allowedTools for coder', () => {
    const ctx = buildIsolatedContext('coder', SAMPLE_CONTEXT, []);
    expect(ctx.allowedTools).toContain('execute_code');
    expect(ctx.allowedTools).not.toContain('draft_email');
  });

  it('sets tokenBudget from role definition', () => {
    const ctx = buildIsolatedContext('researcher', SAMPLE_CONTEXT, []);
    expect(ctx.tokenBudget).toBe(12000);
  });

  it('sets reviewer tokenBudget to 6000', () => {
    const ctx = buildIsolatedContext('reviewer', SAMPLE_CONTEXT, []);
    expect(ctx.tokenBudget).toBe(6000);
  });

  it('truncates relevantContext to approximate token budget', () => {
    // Create a very large context (~100K chars → ~33K tokens, well above all budgets)
    const hugeContext = '[facts] '.repeat(1) + 'x'.repeat(200000);
    const ctx = buildIsolatedContext('reviewer', hugeContext, []);
    // reviewer tokenBudget = 6000 tokens → ~18000 chars max
    expect(ctx.relevantContext.length).toBeLessThanOrEqual(18000 + 100); // small tolerance
  });

  it('includes sharedResults from other agents', () => {
    const results = ['Researcher found: TypeScript is popular.', 'Writer drafted: Introduction paragraph.'];
    const ctx = buildIsolatedContext('reviewer', SAMPLE_CONTEXT, results);
    expect(ctx.sharedResults).toEqual(results);
  });

  it('truncates sharedResults to 2000 chars combined', () => {
    const longResult = 'Result: ' + 'y'.repeat(3000);
    const ctx = buildIsolatedContext('writer', SAMPLE_CONTEXT, [longResult]);
    const totalLength = ctx.sharedResults.join('').length;
    expect(totalLength).toBeLessThanOrEqual(2000 + 10); // small tolerance
  });

  it('falls back gracefully for unknown role', () => {
    const ctx = buildIsolatedContext('unknown_role', SAMPLE_CONTEXT, []);
    expect(ctx).toBeDefined();
    expect(ctx.systemPrompt).toBeTruthy();
    expect(ctx.allowedTools).toEqual([]);
    expect(ctx.relevantContext).toBeTruthy();
  });

  it('accepts custom agentRoles override', () => {
    const customRoles: Record<string, AgentRole> = {
      tester: {
        name: 'Tester',
        persona: 'Du bist ein Test-Agent.',
        focusAreas: ['facts'],
        excludeAreas: [],
        tools: ['search_ideas'],
        tokenBudget: 4000,
      },
    };
    const ctx = buildIsolatedContext('tester', SAMPLE_CONTEXT, [], customRoles);
    expect(ctx.systemPrompt).toContain('Test-Agent');
    expect(ctx.allowedTools).toContain('search_ideas');
    expect(ctx.tokenBudget).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// buildTeamContexts
// ---------------------------------------------------------------------------

describe('buildTeamContexts', () => {
  it('builds isolated contexts for all specified roles', () => {
    const team = buildTeamContexts(['researcher', 'writer', 'reviewer'], SAMPLE_CONTEXT);
    expect(team).toHaveProperty('researcher');
    expect(team).toHaveProperty('writer');
    expect(team).toHaveProperty('reviewer');
    expect(team).not.toHaveProperty('coder');
  });

  it('builds contexts for a full 4-agent team', () => {
    const team = buildTeamContexts(['researcher', 'writer', 'reviewer', 'coder'], SAMPLE_CONTEXT);
    expect(Object.keys(team)).toHaveLength(4);
  });

  it('each agent context has correct tokenBudget', () => {
    const team = buildTeamContexts(['researcher', 'writer', 'coder'], SAMPLE_CONTEXT);
    expect(team.researcher.tokenBudget).toBe(12000);
    expect(team.writer.tokenBudget).toBe(8000);
    expect(team.coder.tokenBudget).toBe(10000);
  });

  it('each agent starts with empty sharedResults', () => {
    const team = buildTeamContexts(['researcher', 'writer'], SAMPLE_CONTEXT);
    expect(team.researcher.sharedResults).toEqual([]);
    expect(team.writer.sharedResults).toEqual([]);
  });

  it('each agent receives role-appropriate allowedTools', () => {
    const team = buildTeamContexts(['researcher', 'coder'], SAMPLE_CONTEXT);
    expect(team.researcher.allowedTools).toContain('web_search');
    expect(team.coder.allowedTools).toContain('execute_code');
    expect(team.researcher.allowedTools).not.toContain('execute_code');
    expect(team.coder.allowedTools).not.toContain('draft_email');
  });

  it('returns empty object for empty roles array', () => {
    const team = buildTeamContexts([], SAMPLE_CONTEXT);
    expect(team).toEqual({});
  });

  it('handles unknown role gracefully in team build', () => {
    const team = buildTeamContexts(['researcher', 'unknown_role'], SAMPLE_CONTEXT);
    expect(team).toHaveProperty('researcher');
    expect(team).toHaveProperty('unknown_role');
    expect(team.unknown_role.allowedTools).toEqual([]);
  });
});
