/**
 * Phase 99: Tool Search Tests
 */

import type { ToolDefinition } from '../../../services/claude/tool-use';

// No external dependencies to mock
import {
  initToolRegistry,
  searchTools,
  getCoreTools,
  getAllToolDefinitions,
  handleSearchTools,
  searchToolsDefinition,
  CORE_TOOL_NAMES,
} from '../../../services/tool-handlers/tool-search';

// Mock tool definitions for testing
const mockTools: ToolDefinition[] = [
  {
    name: 'search_tools',
    description: 'Search for available tools',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Query' } }, required: ['query'] },
  },
  {
    name: 'remember',
    description: 'Store information in long-term memory for later recall',
    input_schema: { type: 'object', properties: { content: { type: 'string', description: 'Content' } }, required: ['content'] },
  },
  {
    name: 'recall',
    description: 'Search episodic and long-term memory for information',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Query' } }, required: ['query'] },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information using Brave Search',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Query' } }, required: ['query'] },
  },
  {
    name: 'navigate_to',
    description: 'Navigate to a specific page in the application',
    input_schema: { type: 'object', properties: { page: { type: 'string', description: 'Page' } }, required: ['page'] },
  },
  {
    name: 'execute_code',
    description: 'Execute code in a sandboxed environment. Supports Python, Node.js, Bash.',
    input_schema: { type: 'object', properties: { code: { type: 'string', description: 'Code' } }, required: ['code'] },
  },
  {
    name: 'github_search',
    description: 'Search GitHub repositories for code projects and libraries',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Query' } }, required: ['query'] },
  },
  {
    name: 'github_create_issue',
    description: 'Create a new issue in a GitHub repository',
    input_schema: { type: 'object', properties: { title: { type: 'string', description: 'Title' } }, required: ['title'] },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a calendar event with title, date, and participants',
    input_schema: { type: 'object', properties: { title: { type: 'string', description: 'Title' } }, required: ['title'] },
  },
  {
    name: 'draft_email',
    description: 'Draft an email with recipient, subject, and key points',
    input_schema: { type: 'object', properties: { subject: { type: 'string', description: 'Subject' } }, required: ['subject'] },
  },
  {
    name: 'get_revenue_metrics',
    description: 'Get revenue and financial metrics from Stripe',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

beforeAll(() => {
  initToolRegistry(mockTools);
});

describe('Tool Search', () => {
  describe('initToolRegistry', () => {
    it('registers all provided tools', () => {
      const all = getAllToolDefinitions();
      expect(all.length).toBe(mockTools.length);
    });
  });

  describe('searchTools', () => {
    it('finds tools by name keywords', () => {
      const results = searchTools('github');
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.map(r => r.name)).toContain('github_search');
      expect(results.map(r => r.name)).toContain('github_create_issue');
    });

    it('finds tools by description keywords', () => {
      const results = searchTools('code execute');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('execute_code');
    });

    it('finds tools by category', () => {
      const results = searchTools('memory');
      expect(results.length).toBeGreaterThanOrEqual(2);
      const names = results.map(r => r.name);
      expect(names).toContain('remember');
      expect(names).toContain('recall');
    });

    it('respects maxResults limit', () => {
      const results = searchTools('search', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('returns empty array for no matches', () => {
      const results = searchTools('xyznonexistent');
      expect(results.length).toBe(0);
    });

    it('returns empty for empty query', () => {
      const results = searchTools('');
      expect(results.length).toBe(0);
    });

    it('ranks exact name match highest', () => {
      const results = searchTools('web_search');
      expect(results[0].name).toBe('web_search');
    });
  });

  describe('getCoreTools', () => {
    it('returns only core tool definitions', () => {
      const coreTools = getCoreTools();
      const coreNames = coreTools.map(t => t.name);

      for (const name of CORE_TOOL_NAMES) {
        expect(coreNames).toContain(name);
      }

      // Should not include non-core tools
      expect(coreNames).not.toContain('execute_code');
      expect(coreNames).not.toContain('github_search');
    });

    it('returns the correct number of core tools', () => {
      const coreTools = getCoreTools();
      expect(coreTools.length).toBe(CORE_TOOL_NAMES.length);
    });
  });

  describe('searchToolsDefinition', () => {
    it('has correct name', () => {
      expect(searchToolsDefinition.name).toBe('search_tools');
    });

    it('requires query parameter', () => {
      expect(searchToolsDefinition.input_schema.required).toContain('query');
    });
  });

  describe('handleSearchTools', () => {
    const execContext = {
      aiContext: 'personal' as const,
      sessionId: 'test-session',
    };

    it('returns matching tools for valid query', async () => {
      const result = await handleSearchTools({ query: 'email' }, execContext);
      expect(result).toContain('draft_email');
    });

    it('returns error for empty query', async () => {
      const result = await handleSearchTools({ query: '' }, execContext);
      expect(result).toContain('Fehler');
    });

    it('returns message when no tools match', async () => {
      const result = await handleSearchTools({ query: 'xyznonexistent' }, execContext);
      expect(result).toContain('Keine passenden Tools');
    });

    it('respects max_results parameter', async () => {
      const result = await handleSearchTools({ query: 'search', max_results: 1 }, execContext);
      // Should contain exactly 1 numbered result
      const matches = result.match(/^\d+\./gm);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBeLessThanOrEqual(1);
    });
  });
});
