/**
 * Unit Tests for Short-Term Memory Service
 *
 * Tests session-based memory with compression and pre-retrieval.
 */

import { ShortTermMemory, ShortTermMemoryService, shortTermMemory } from '../../../../services/memory/short-term-memory';

// Mock dependencies
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/claude', () => ({
  generateClaudeResponse: jest.fn(),
}));

jest.mock('../../../../services/ai', () => ({
  generateEmbedding: jest.fn(),
}));

jest.mock('../../../../utils/semantic-cache', () => ({
  cosineSimilarity: jest.fn().mockReturnValue(0.8),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { queryContext } from '../../../../utils/database-context';
import { generateClaudeResponse } from '../../../../services/claude';
import { generateEmbedding } from '../../../../services/ai';

var mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
var mockGenerateClaudeResponse = generateClaudeResponse as jest.MockedFunction<typeof generateClaudeResponse>;
var mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;

describe('Short-Term Memory Service', () => {
  let memory: ShortTermMemoryService;

  beforeEach(() => {
    memory = new ShortTermMemoryService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Stop cleanup interval to prevent open handles
    memory.stopCleanupInterval();
  });

  // ===========================================
  // Session Management Tests
  // ===========================================

  describe('getOrCreateMemory', () => {
    it('should create a new memory session', async () => {
      const session = await memory.getOrCreateMemory('session-1', 'personal');

      expect(session).toBeDefined();
      expect(session.sessionId).toBe('session-1');
      expect(session.context).toBe('personal');
      expect(session.recentInteractions).toEqual([]);
    });

    it('should return existing session if already created', async () => {
      const session1 = await memory.getOrCreateMemory('session-1', 'personal');
      const session2 = await memory.getOrCreateMemory('session-1', 'personal');

      expect(session1).toBe(session2);
    });

    it('should create separate sessions for different IDs', async () => {
      const session1 = await memory.getOrCreateMemory('session-1', 'personal');
      const session2 = await memory.getOrCreateMemory('session-2', 'personal');

      expect(session1).not.toBe(session2);
      expect(session1.sessionId).toBe('session-1');
      expect(session2.sessionId).toBe('session-2');
    });
  });

  // ===========================================
  // Interaction Tests
  // ===========================================

  describe('addInteraction', () => {
    it('should add an interaction to the session', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');

      await memory.addInteraction('session-1', {
        role: 'user',
        content: 'Hello',
      });

      const session = memory.getMemory('session-1');
      expect(session?.recentInteractions).toHaveLength(1);
      expect(session?.recentInteractions[0].role).toBe('user');
      expect(session?.recentInteractions[0].content).toBe('Hello');
    });

    it('should add timestamp to interaction', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');

      await memory.addInteraction('session-1', {
        role: 'assistant',
        content: 'Hi there!',
      });

      const session = memory.getMemory('session-1');
      expect(session?.recentInteractions[0].timestamp).toBeInstanceOf(Date);
    });

    it('should add metadata to interaction', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');

      await memory.addInteraction('session-1', {
        role: 'user',
        content: 'Test',
        metadata: { source: 'voice' },
      });

      const session = memory.getMemory('session-1');
      expect(session?.recentInteractions[0].metadata).toEqual({ source: 'voice' });
    });

    it('should trigger compression when threshold is reached', async () => {
      mockGenerateClaudeResponse.mockResolvedValue('Summary of conversation');

      await memory.getOrCreateMemory('session-1', 'personal');

      // Add interactions up to compression threshold (MAX_INTERACTIONS = 20)
      for (let i = 0; i < 20; i++) {
        await memory.addInteraction('session-1', {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        });
      }

      const session = memory.getMemory('session-1');

      // After compression, should have fewer interactions (KEEP_AFTER_COMPRESSION = 5) and a summary
      expect(session?.compressedSummary).toBeDefined();
      expect(session?.recentInteractions.length).toBeLessThanOrEqual(5);
    });

    it('should not throw for non-existent session but just warn', async () => {
      // Implementation logs a warning but doesn't throw
      await expect(
        memory.addInteraction('non-existent', { role: 'user', content: 'Test' })
      ).resolves.not.toThrow();
    });
  });

  // ===========================================
  // Compression Tests
  // ===========================================

  describe('compression', () => {
    it('should compress interactions to summary', async () => {
      mockGenerateClaudeResponse.mockResolvedValue('User discussed project planning and deadlines.');

      await memory.getOrCreateMemory('session-1', 'personal');

      // Add 20 interactions to trigger compression (MAX_INTERACTIONS = 20)
      for (let i = 0; i < 20; i++) {
        await memory.addInteraction('session-1', {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message about planning ${i}`,
        });
      }

      const session = memory.getMemory('session-1');

      expect(session?.compressedSummary).toContain('planning');
      expect(mockGenerateClaudeResponse).toHaveBeenCalled();
    });

    it('should keep recent interactions after compression', async () => {
      mockGenerateClaudeResponse.mockResolvedValue('Summary');

      await memory.getOrCreateMemory('session-1', 'personal');

      // Add 20 interactions to trigger compression
      for (let i = 0; i < 20; i++) {
        await memory.addInteraction('session-1', {
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const session = memory.getMemory('session-1');

      // Should keep the last 5 interactions (KEEP_AFTER_COMPRESSION = 5)
      expect(session?.recentInteractions.length).toBeLessThanOrEqual(5);
      expect(session?.recentInteractions[session.recentInteractions.length - 1].content).toBe('Message 19');
    });
  });

  // ===========================================
  // Pre-Retrieval Tests
  // ===========================================

  describe('pre-retrieval', () => {
    it('should pre-retrieve relevant documents based on conversation', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [
          { id: 'idea-1', title: 'Project Plan', summary: 'Planning doc', relevance: 0.9 },
          { id: 'idea-2', title: 'Deadline Tracker', summary: 'Tracking', relevance: 0.8 },
        ],
        rowCount: 2,
      } as any);

      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      await memory.getOrCreateMemory('session-1', 'personal');

      await memory.addInteraction('session-1', {
        role: 'user',
        content: 'Tell me about my project deadlines',
      });

      const session = memory.getMemory('session-1');

      // Pre-retrieved documents should be populated
      expect(session?.preRetrievedDocs).toBeDefined();
    });
  });

  // ===========================================
  // Enriched Context Tests
  // ===========================================

  describe('getEnrichedContext', () => {
    it('should return enriched context for a session', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');

      await memory.addInteraction('session-1', {
        role: 'user',
        content: 'Hello',
      });

      await memory.addInteraction('session-1', {
        role: 'assistant',
        content: 'Hi!',
      });

      const context = await memory.getEnrichedContext('session-1');

      expect(context).toBeDefined();
      expect(context.recentMessages).toHaveLength(2);
      expect(context.conversationSummary).toBeDefined();
    });

    it('should include pre-loaded ideas', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{ id: 'idea-1', title: 'Test', summary: 'Test idea' }],
        rowCount: 1,
      } as any);

      await memory.getOrCreateMemory('session-1', 'personal');
      await memory.addInteraction('session-1', { role: 'user', content: 'Test query' });

      const context = await memory.getEnrichedContext('session-1');

      expect(context.preloadedIdeas).toBeDefined();
    });

    it('should include contextual hints', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');

      // Add interactions to generate hints
      await memory.addInteraction('session-1', { role: 'user', content: 'What about my tasks?' });

      const context = await memory.getEnrichedContext('session-1');

      expect(context.contextualHints).toBeDefined();
      expect(Array.isArray(context.contextualHints)).toBe(true);
    });

    it('should include suggested follow-ups', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');
      await memory.addInteraction('session-1', { role: 'user', content: 'Test' });

      const context = await memory.getEnrichedContext('session-1');

      expect(context.suggestedFollowUps).toBeDefined();
      expect(Array.isArray(context.suggestedFollowUps)).toBe(true);
    });

    it('should return empty context for non-existent session', async () => {
      const context = await memory.getEnrichedContext('non-existent');

      expect(context.recentMessages).toEqual([]);
      expect(context.conversationSummary).toBe('');
    });
  });

  // ===========================================
  // Session Cleanup Tests
  // ===========================================

  describe('clearMemory', () => {
    it('should remove a session', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');
      memory.clearMemory('session-1');

      expect(memory.getMemory('session-1')).toBeNull();
    });

    it('should not throw for non-existent session', () => {
      expect(() => memory.clearMemory('non-existent')).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return statistics about memory usage', async () => {
      await memory.getOrCreateMemory('session-1', 'personal');
      await memory.getOrCreateMemory('session-2', 'work');

      const stats = memory.getStats();

      expect(stats.activeMemories).toBe(2);
      expect(stats.totalInteractions).toBeDefined();
    });
  });

  // ===========================================
  // Singleton Tests
  // ===========================================

  describe('shortTermMemory singleton', () => {
    it('should be defined', () => {
      expect(shortTermMemory).toBeDefined();
      expect(shortTermMemory).toBeInstanceOf(ShortTermMemoryService);
    });
  });
});
