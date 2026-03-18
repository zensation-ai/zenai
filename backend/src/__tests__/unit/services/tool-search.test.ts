/**
 * Phase 100 B4: Semantic Tool Search Tests
 *
 * Tests the ToolSearchService class which provides keyword-based
 * tool discovery using the toolRegistry.
 */

import type { ToolDefinition } from '../../../services/claude/tool-use';

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the toolRegistry — must use jest.fn() inline due to hoisting
const mockGetDefinitions = jest.fn();
jest.mock('../../../services/claude/tool-use', () => ({
  toolRegistry: {
    getDefinitions: (...args: unknown[]) => mockGetDefinitions(...args),
  },
}));

import { ToolSearchService } from '../../../services/tool-handlers/tool-search';

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

beforeEach(() => {
  mockGetDefinitions.mockReturnValue(mockTools);
});

describe('ToolSearchService', () => {
  let service: ToolSearchService;

  beforeEach(() => {
    service = new ToolSearchService();
  });

  describe('search (keyword-only, no embeddings)', () => {
    it('finds tools by name keywords', async () => {
      const results = await service.search('github');
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.map(r => r.name)).toContain('github_search');
      expect(results.map(r => r.name)).toContain('github_create_issue');
    });

    it('finds tools by description keywords', async () => {
      const results = await service.search('code execute');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.map(r => r.name)).toContain('execute_code');
    });

    it('finds tools by category', async () => {
      const results = await service.search('memory');
      expect(results.length).toBeGreaterThanOrEqual(2);
      const names = results.map(r => r.name);
      expect(names).toContain('remember');
      expect(names).toContain('recall');
    });

    it('respects limit parameter', async () => {
      const results = await service.search('search', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('returns empty array for no matches', async () => {
      const results = await service.search('xyznonexistent');
      expect(results.length).toBe(0);
    });

    it('returns empty for empty query', async () => {
      const results = await service.search('');
      expect(results.length).toBe(0);
    });

    it('ranks exact name match highest', async () => {
      const results = await service.search('web_search');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('web_search');
    });

    it('returns results with keyword matchSource', async () => {
      const results = await service.search('email');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchSource).toBe('keyword');
    });

    it('finds tools by partial description match', async () => {
      const results = await service.search('calendar event');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.map(r => r.name)).toContain('create_calendar_event');
    });
  });

  describe('ToolSearchResult shape', () => {
    it('returns results with name, description, score, matchSource', async () => {
      const results = await service.search('github');
      expect(results.length).toBeGreaterThan(0);
      const result = results[0];
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('matchSource');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('score ordering', () => {
    it('returns results sorted by score descending', async () => {
      const results = await service.search('search');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });
});
