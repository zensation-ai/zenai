/**
 * Unit Tests for Tool Handlers
 *
 * Tests the tool handler implementations for Claude Tool Use including:
 * - Search ideas handler
 * - Create idea handler
 * - Remember/Recall handlers
 * - Calculate handler
 * - Get related ideas handler
 * - Handler registration
 *
 * Rewritten for Phase 3 to use ToolExecutionContext API.
 *
 * @module tests/services/tool-handlers
 */

import { ToolExecutionContext, toolRegistry } from '../../../services/claude/tool-use';
import {
  registerAllToolHandlers,
  areToolsRegistered,
} from '../../../services/tool-handlers';

// Mock dependencies
jest.mock('../../../services/enhanced-rag', () => ({
  enhancedRAG: {
    quickRetrieve: jest.fn().mockResolvedValue([
      { title: 'Test Idea 1', summary: 'Summary 1', score: 0.95, id: 'id-1' },
      { title: 'Test Idea 2', summary: 'Summary 2', score: 0.85, id: 'id-2' },
    ]),
  },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
}));

jest.mock('../../../services/memory', () => ({
  longTermMemory: {
    addFact: jest.fn().mockResolvedValue(undefined),
    retrieve: jest.fn().mockResolvedValue({
      facts: [
        { content: 'Test fact 1', confidence: 0.9, factType: 'knowledge' },
        { content: 'Test fact 2', confidence: 0.8, factType: 'preference' },
      ],
      patterns: [],
    }),
  },
  episodicMemory: {
    retrieve: jest.fn().mockResolvedValue([
      {
        trigger: 'meeting discussion',
        response: 'Discussed project timeline',
        emotionalValence: 0.5,
        timestamp: new Date(),
        similarity: 0.9,
      },
    ]),
  },
}));

jest.mock('../../../services/web-search', () => ({
  searchWeb: jest.fn().mockResolvedValue([]),
  formatSearchResults: jest.fn().mockReturnValue('No results'),
}));

jest.mock('../../../services/url-fetch', () => ({
  fetchUrl: jest.fn().mockResolvedValue({ title: 'Test', content: 'Content' }),
  formatForTool: jest.fn().mockReturnValue('Fetched content'),
  isValidUrl: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../services/github', () => ({
  isGitHubAvailable: jest.fn().mockReturnValue(false),
  searchRepositories: jest.fn(),
  formatSearchResults: jest.fn(),
  createIssue: jest.fn(),
  formatIssue: jest.fn(),
  getRepository: jest.fn(),
  formatRepository: jest.fn(),
  listIssues: jest.fn(),
  getPullRequest: jest.fn(),
  getPullRequestFiles: jest.fn(),
  formatPullRequest: jest.fn(),
}));

jest.mock('../../../services/project-context', () => ({
  generateProjectContext: jest.fn(),
  getQuickProjectSummary: jest.fn(),
  scanProjectStructure: jest.fn(),
}));

jest.mock('../../../services/code-execution', () => ({
  executeCodeDirect: jest.fn(),
  isCodeExecutionEnabled: jest.fn().mockReturnValue(false),
  isSupportedLanguage: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import mocks after setup
import { enhancedRAG } from '../../../services/enhanced-rag';
import { queryContext } from '../../../utils/database-context';
import { longTermMemory, episodicMemory } from '../../../services/memory';

/** Default execution context for tests */
const defaultContext: ToolExecutionContext = {
  aiContext: 'personal',
  sessionId: 'test-session-id',
};

describe('Tool Handlers', () => {
  beforeAll(() => {
    registerAllToolHandlers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // Search Ideas Handler Tests
  // ===========================================

  describe('search_ideas handler', () => {
    it('should return search results', async () => {
      const result = await toolRegistry.execute('search_ideas', { query: 'project management' }, defaultContext);

      expect(result).toContain('Gefundene Ideen');
      expect(result).toContain('Test Idea 1');
      expect(result).toContain('Test Idea 2');
    });

    it('should respect limit parameter', async () => {
      await toolRegistry.execute('search_ideas', { query: 'test', limit: 3 }, defaultContext);

      expect(enhancedRAG.quickRetrieve).toHaveBeenCalledWith('test', 'personal', 3);
    });

    it('should use work context when specified', async () => {
      const workContext: ToolExecutionContext = { aiContext: 'work' };
      await toolRegistry.execute('search_ideas', { query: 'test', limit: 5 }, workContext);

      expect(enhancedRAG.quickRetrieve).toHaveBeenCalledWith('test', 'work', 5);
    });

    it('should handle no results', async () => {
      (enhancedRAG.quickRetrieve as jest.Mock).mockResolvedValueOnce([]);

      const result = await toolRegistry.execute('search_ideas', { query: 'nonexistent' }, defaultContext);

      expect(result).toContain('Keine Ideen gefunden');
    });

    it('should handle missing query', async () => {
      const result = await toolRegistry.execute('search_ideas', {}, defaultContext);

      expect(result).toContain('Fehler');
      expect(result).toContain('Keine Suchanfrage');
    });

    it('should handle errors gracefully', async () => {
      (enhancedRAG.quickRetrieve as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const result = await toolRegistry.execute('search_ideas', { query: 'test' }, defaultContext);

      expect(result).toContain('Fehler bei der Suche');
    });
  });

  // ===========================================
  // Create Idea Handler Tests
  // ===========================================

  describe('create_idea handler', () => {
    it('should create an idea', async () => {
      const result = await toolRegistry.execute('create_idea', {
        title: 'New Idea',
        type: 'task',
        summary: 'This is a test idea',
        category: 'development',
        priority: 'high',
      }, defaultContext);

      expect(result).toContain('erfolgreich erstellt');
      expect(result).toContain('New Idea');
      expect(result).toContain('task');
      expect(result).toContain('high');
    });

    it('should handle missing required fields', async () => {
      const result = await toolRegistry.execute('create_idea', {
        title: 'Only Title',
        // missing type and summary
      }, defaultContext);

      expect(result).toContain('Fehler');
      expect(result).toContain('erforderlich');
    });

    it('should use default category and priority', async () => {
      const result = await toolRegistry.execute('create_idea', {
        title: 'Minimal Idea',
        type: 'note',
        summary: 'Minimal idea content',
      }, defaultContext);

      expect(result).toContain('erfolgreich erstellt');
      expect(queryContext).toHaveBeenCalled();
    });

    it('should handle next_steps parameter', async () => {
      await toolRegistry.execute('create_idea', {
        title: 'Idea with Steps',
        type: 'task',
        summary: 'Task with action items',
        next_steps: ['Step 1', 'Step 2', 'Step 3'],
      }, defaultContext);

      expect(queryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining([
          expect.stringContaining('Step 1'),
        ])
      );
    });

    it('should handle database errors', async () => {
      (queryContext as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const result = await toolRegistry.execute('create_idea', {
        title: 'Error Idea',
        type: 'test',
        summary: 'Will fail',
      }, defaultContext);

      expect(result).toContain('Fehler beim Erstellen');
    });
  });

  // ===========================================
  // Remember Handler Tests
  // ===========================================

  describe('remember handler', () => {
    it('should store information in long-term memory', async () => {
      const result = await toolRegistry.execute('remember', {
        content: 'The project deadline is December 15th',
        fact_type: 'knowledge',
        confidence: 0.95,
      }, defaultContext);

      expect(result).toContain('gespeichert');
      expect(longTermMemory.addFact).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          factType: 'knowledge',
          content: 'The project deadline is December 15th',
          confidence: 0.95,
          source: 'explicit',
        })
      );
    });

    it('should handle missing content', async () => {
      const result = await toolRegistry.execute('remember', {}, defaultContext);

      expect(result).toContain('Fehler');
    });

    it('should use default confidence if not provided', async () => {
      await toolRegistry.execute('remember', {
        content: 'Important information',
        fact_type: 'knowledge',
      }, defaultContext);

      expect(longTermMemory.addFact).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          confidence: 0.8,
        })
      );
    });

    it('should validate fact_type', async () => {
      const result = await toolRegistry.execute('remember', {
        content: 'Something',
        fact_type: 'invalid_type',
      }, defaultContext);

      expect(result).toContain('Fehler');
      expect(result).toContain('Ungültiger Fakt-Typ');
    });
  });

  // ===========================================
  // Recall Handler Tests
  // ===========================================

  describe('recall handler', () => {
    it('should retrieve relevant memories', async () => {
      const result = await toolRegistry.execute('recall', {
        query: 'What do I know about the project?',
      }, defaultContext);

      expect(result).toContain('Suchergebnisse');
      expect(longTermMemory.retrieve).toHaveBeenCalledWith('personal', expect.any(String));
      expect(episodicMemory.retrieve).toHaveBeenCalled();
    });

    it('should include long-term facts', async () => {
      const result = await toolRegistry.execute('recall', { query: 'facts' }, defaultContext);

      expect(result).toContain('Test fact 1');
    });

    it('should include episodic memories', async () => {
      const result = await toolRegistry.execute('recall', { query: 'meeting' }, defaultContext);

      expect(result).toContain('meeting discussion');
    });

    it('should handle missing query', async () => {
      const result = await toolRegistry.execute('recall', {}, defaultContext);

      expect(result).toContain('Fehler');
    });

    it('should handle no memories found', async () => {
      (longTermMemory.retrieve as jest.Mock).mockResolvedValueOnce({ facts: [], patterns: [] });
      (episodicMemory.retrieve as jest.Mock).mockResolvedValueOnce([]);

      const result = await toolRegistry.execute('recall', { query: 'unknown topic' }, defaultContext);

      expect(result).toContain('keine Erinnerungen');
    });
  });

  // ===========================================
  // Calculate Handler Tests
  // ===========================================

  describe('calculate handler', () => {
    it('should perform basic calculations', async () => {
      const result = await toolRegistry.execute('calculate', { expression: '2 + 2' }, defaultContext);

      expect(result).toContain('4');
    });

    it('should handle complex expressions', async () => {
      const result = await toolRegistry.execute('calculate', { expression: '(10 * 5) / 2 + 3' }, defaultContext);

      expect(result).toContain('28');
    });

    it('should handle missing expression', async () => {
      const result = await toolRegistry.execute('calculate', {}, defaultContext);

      expect(result).toContain('Fehler');
    });

    it('should handle invalid expressions safely', async () => {
      const result = await toolRegistry.execute('calculate', { expression: 'invalid math' }, defaultContext);

      expect(typeof result).toBe('string');
      expect(result).toContain('Fehler');
    });

    it('should prevent code injection', async () => {
      const result = await toolRegistry.execute('calculate', {
        expression: 'process.exit(1)',
      }, defaultContext);

      expect(result).toContain('Fehler');
    });

    it('should handle modulo operations', async () => {
      const result = await toolRegistry.execute('calculate', { expression: '10 % 3' }, defaultContext);

      expect(result).toContain('1');
    });

    it('should handle division by zero', async () => {
      const result = await toolRegistry.execute('calculate', { expression: '5 / 0' }, defaultContext);

      expect(result).toContain('Fehler');
      expect(result).toContain('Division durch Null');
    });
  });

  // ===========================================
  // Get Related Ideas Handler Tests
  // ===========================================

  describe('get_related_ideas handler', () => {
    beforeEach(() => {
      (queryContext as jest.Mock).mockReset();
      // First call: source idea lookup
      (queryContext as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'test-idea-id', title: 'Source Idea', summary: 'A source idea' }],
      });
      // Second call: related ideas query
      (queryContext as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            related_id: 'related-1',
            title: 'Related Idea 1',
            relationship_type: 'similar',
            strength: 0.9,
            summary: 'Related summary',
          },
          {
            related_id: 'related-2',
            title: 'Related Idea 2',
            relationship_type: 'extends',
            strength: 0.8,
            summary: null,
          },
        ],
      });
    });

    it('should find related ideas', async () => {
      const result = await toolRegistry.execute('get_related_ideas', { idea_id: 'test-idea-id' }, defaultContext);

      expect(result).toContain('Verbundene Ideen');
      expect(result).toContain('Related Idea 1');
    });

    it('should handle missing idea_id', async () => {
      const result = await toolRegistry.execute('get_related_ideas', {}, defaultContext);

      expect(result).toContain('Fehler');
      expect(result).toContain('Idee-ID');
    });

    it('should handle source idea not found', async () => {
      (queryContext as jest.Mock).mockReset();
      (queryContext as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await toolRegistry.execute('get_related_ideas', { idea_id: 'nonexistent' }, defaultContext);

      expect(result).toContain('nicht gefunden');
    });

    it('should handle no related ideas found', async () => {
      (queryContext as jest.Mock).mockReset();
      (queryContext as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'isolated', title: 'Isolated Idea', summary: 'No connections' }],
      });
      (queryContext as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await toolRegistry.execute('get_related_ideas', { idea_id: 'isolated' }, defaultContext);

      expect(result).toContain('Keine verbundenen');
    });
  });

  // ===========================================
  // Handler Registration Tests
  // ===========================================

  describe('Handler Registration', () => {
    it('should register all core handlers', () => {
      expect(toolRegistry.has('search_ideas')).toBe(true);
      expect(toolRegistry.has('create_idea')).toBe(true);
      expect(toolRegistry.has('get_related_ideas')).toBe(true);
      expect(toolRegistry.has('calculate')).toBe(true);
      expect(toolRegistry.has('remember')).toBe(true);
      expect(toolRegistry.has('recall')).toBe(true);
    });

    it('should register web tool handlers', () => {
      expect(toolRegistry.has('web_search')).toBe(true);
      expect(toolRegistry.has('fetch_url')).toBe(true);
    });

    it('should register github handlers', () => {
      expect(toolRegistry.has('github_search')).toBe(true);
      expect(toolRegistry.has('github_create_issue')).toBe(true);
      expect(toolRegistry.has('github_repo_info')).toBe(true);
      expect(toolRegistry.has('github_list_issues')).toBe(true);
      expect(toolRegistry.has('github_pr_summary')).toBe(true);
    });

    it('should register project context handlers', () => {
      expect(toolRegistry.has('analyze_project')).toBe(true);
      expect(toolRegistry.has('get_project_summary')).toBe(true);
      expect(toolRegistry.has('list_project_files')).toBe(true);
    });

    it('should register code execution handler', () => {
      expect(toolRegistry.has('execute_code')).toBe(true);
    });

    it('should report tools as registered via areToolsRegistered', () => {
      expect(areToolsRegistered()).toBe(true);
    });

    it('should not throw when registering handlers multiple times', () => {
      expect(() => registerAllToolHandlers()).not.toThrow();
    });
  });
});
