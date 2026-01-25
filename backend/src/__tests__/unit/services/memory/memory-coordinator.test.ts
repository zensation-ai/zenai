/**
 * Unit Tests for Memory Coordinator
 *
 * Tests the central coordinator that bridges all four memory layers.
 * HiMeS Architecture: Working Memory, Episodic Memory, Short-Term Memory, Long-Term Memory.
 */

import { MemoryCoordinator, memoryCoordinator } from '../../../../services/memory/memory-coordinator';

// Mock all memory services
jest.mock('../../../../services/memory/short-term-memory', () => ({
  shortTermMemory: {
    getOrCreateMemory: jest.fn().mockResolvedValue({ sessionId: 'test', recentInteractions: [] }),
    addInteraction: jest.fn(),
    getMemory: jest.fn().mockReturnValue({ recentInteractions: [], context: 'work' }),
    clearMemory: jest.fn(),
    getEnrichedContext: jest.fn().mockResolvedValue({
      recentMessages: [{ role: 'user', content: 'Hello' }],
      conversationSummary: 'Test summary',
      preloadedIdeas: [],
      contextualHints: ['Hint 1'],
      suggestedFollowUps: ['Follow up 1'],
    }),
    getStats: jest.fn().mockReturnValue({ activeMemories: 1, totalInteractions: 5 }),
  },
}));

jest.mock('../../../../services/memory/long-term-memory', () => ({
  longTermMemory: {
    initialize: jest.fn().mockResolvedValue(undefined),
    retrieve: jest.fn().mockResolvedValue({
      facts: [{ content: 'User prefers morning meetings', confidence: 0.9, lastConfirmed: new Date() }],
      patterns: [{ pattern: 'Often asks about deadlines', confidence: 0.8, lastUsed: new Date() }],
      relevantInteractions: [{ summary: 'Past interaction', significance: 0.7, timestamp: new Date() }],
    }),
    consolidate: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockResolvedValue({ factsCount: 10, patternsCount: 5 }),
    addFact: jest.fn().mockResolvedValue(undefined),
    getFacts: jest.fn().mockResolvedValue([]),
    getPatterns: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../../../services/memory/episodic-memory', () => ({
  episodicMemory: {
    retrieve: jest.fn().mockResolvedValue([
      {
        id: 'ep-1',
        trigger: 'Similar past question',
        response: 'Past response',
        episodeType: 'conversation',
        temporalContext: { timeOfDay: 'morning', dayOfWeek: 'Monday', weekOfYear: 4 },
        retrievalStrength: 0.8,
        timestamp: new Date(),
      },
    ]),
    calculateEmotionalTone: jest.fn().mockReturnValue({
      avgValence: 0.5,
      avgArousal: 0.4,
      dominantMood: 'positive',
    }),
  },
}));

jest.mock('../../../../services/memory/working-memory', () => ({
  workingMemory: {
    getState: jest.fn().mockReturnValue(null),
    initialize: jest.fn().mockReturnValue({
      sessionId: 'test',
      currentGoal: 'Test goal',
      subGoals: [],
      slots: [{ id: '1', type: 'goal', content: 'Test goal', priority: 1, activation: 1 }],
      context: 'work',
      capacity: 7,
      createdAt: new Date(),
      lastActivity: new Date(),
    }),
    add: jest.fn().mockResolvedValue({ id: '2', type: 'fact', content: 'Test', priority: 0.5, activation: 1 }),
    generateContextString: jest.fn().mockReturnValue('[AKTUELLES ZIEL]\nTest goal'),
  },
}));

jest.mock('../../../../utils/semantic-cache', () => ({
  semanticCache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
  cosineSimilarity: jest.fn().mockReturnValue(0.8),
}));

jest.mock('../../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { shortTermMemory } from '../../../../services/memory/short-term-memory';
import { longTermMemory } from '../../../../services/memory/long-term-memory';
import { episodicMemory } from '../../../../services/memory/episodic-memory';
import { workingMemory } from '../../../../services/memory/working-memory';

describe('Memory Coordinator', () => {
  let coordinator: MemoryCoordinator;

  beforeEach(() => {
    coordinator = new MemoryCoordinator();
    jest.clearAllMocks();
  });

  // ===========================================
  // Session Management Tests
  // ===========================================

  describe('startSession', () => {
    it('should start a new memory session', async () => {
      const sessionId = await coordinator.startSession('work');

      expect(sessionId).toBeDefined();
      expect(sessionId).toContain('session_');
      expect(shortTermMemory.getOrCreateMemory).toHaveBeenCalled();
      expect(longTermMemory.initialize).toHaveBeenCalledWith('work');
    });

    it('should accept metadata', async () => {
      const sessionId = await coordinator.startSession('personal', { source: 'voice' });

      expect(sessionId).toBeDefined();
    });
  });

  describe('addInteraction', () => {
    it('should add interaction to short-term memory', async () => {
      await coordinator.addInteraction('session-1', 'user', 'Hello, how are you?');

      expect(shortTermMemory.addInteraction).toHaveBeenCalledWith('session-1', {
        role: 'user',
        content: 'Hello, how are you?',
        metadata: undefined,
      });
    });

    it('should include metadata when provided', async () => {
      await coordinator.addInteraction('session-1', 'assistant', 'I am fine', { tokens: 10 });

      expect(shortTermMemory.addInteraction).toHaveBeenCalledWith('session-1', {
        role: 'assistant',
        content: 'I am fine',
        metadata: { tokens: 10 },
      });
    });
  });

  describe('endSession', () => {
    it('should clear short-term memory on session end', async () => {
      await coordinator.endSession('session-1');

      expect(shortTermMemory.clearMemory).toHaveBeenCalledWith('session-1');
    });

    it('should trigger consolidation when requested', async () => {
      (shortTermMemory.getMemory as jest.Mock).mockReturnValue({
        recentInteractions: new Array(10).fill({ role: 'user', content: 'test' }),
        context: 'work',
      });

      await coordinator.endSession('session-1', true);

      expect(longTermMemory.consolidate).toHaveBeenCalledWith('work');
    });

    it('should not consolidate for short sessions', async () => {
      (shortTermMemory.getMemory as jest.Mock).mockReturnValue({
        recentInteractions: [{ role: 'user', content: 'test' }],
        context: 'work',
      });

      await coordinator.endSession('session-1', true);

      expect(longTermMemory.consolidate).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // Context Preparation Tests
  // ===========================================

  describe('prepareContext', () => {
    it('should prepare context from all memory sources', async () => {
      const context = await coordinator.prepareContext('session-1', 'What are my tasks?', 'work');

      expect(context).toBeDefined();
      expect(context.sessionId).toBe('session-1');
      expect(context.parts).toBeDefined();
      expect(context.conversationSummary).toBeDefined();
    });

    it('should include long-term memory by default', async () => {
      await coordinator.prepareContext('session-1', 'Query', 'work');

      expect(longTermMemory.retrieve).toHaveBeenCalledWith('work', 'Query');
    });

    it('should exclude long-term memory when disabled', async () => {
      await coordinator.prepareContext('session-1', 'Query', 'work', {
        includeLongTerm: false,
      });

      expect(longTermMemory.retrieve).not.toHaveBeenCalled();
    });

    it('should use cache for repeated queries', async () => {
      const { semanticCache } = require('../../../../utils/semantic-cache');
      semanticCache.get.mockResolvedValueOnce({
        sessionId: 'session-1',
        parts: [],
        systemEnhancement: 'cached',
      });

      const context = await coordinator.prepareContext('session-1', 'Same query', 'work');

      expect(context.systemEnhancement).toBe('cached');
    });

    it('should return minimal context on error', async () => {
      (shortTermMemory.getEnrichedContext as jest.Mock).mockRejectedValueOnce(new Error('Test error'));

      const context = await coordinator.prepareContext('session-1', 'Query', 'work');

      expect(context.parts).toEqual([]);
      expect(context.systemEnhancement).toBe('');
    });
  });

  // ===========================================
  // Enhanced Context Preparation Tests
  // ===========================================

  describe('prepareEnhancedContext', () => {
    it('should prepare enhanced context with all 4 memory layers', async () => {
      const context = await coordinator.prepareEnhancedContext('session-1', 'Complex query', 'work');

      expect(context).toBeDefined();
      expect(context.workingMemory).toBeDefined();
      expect(context.episodicMemory).toBeDefined();
      expect(context.estimatedTokens).toBeDefined();
    });

    it('should initialize working memory if not exists', async () => {
      (workingMemory.getState as jest.Mock).mockReturnValue(null);

      await coordinator.prepareEnhancedContext('session-1', 'New task', 'work');

      expect(workingMemory.initialize).toHaveBeenCalledWith('session-1', 'New task', 'work');
    });

    it('should include episodic memory by default', async () => {
      await coordinator.prepareEnhancedContext('session-1', 'Query', 'work');

      expect(episodicMemory.retrieve).toHaveBeenCalled();
    });

    it('should exclude episodic memory when disabled', async () => {
      await coordinator.prepareEnhancedContext('session-1', 'Query', 'work', {
        includeEpisodic: false,
      });

      expect(episodicMemory.retrieve).not.toHaveBeenCalled();
    });

    it('should calculate emotional tone from episodes', async () => {
      await coordinator.prepareEnhancedContext('session-1', 'Query', 'work');

      expect(episodicMemory.calculateEmotionalTone).toHaveBeenCalled();
    });

    it('should respect token budget', async () => {
      const context = await coordinator.prepareEnhancedContext('session-1', 'Query', 'work', {
        maxContextTokens: 1000,
      });

      expect(context.estimatedTokens).toBeLessThanOrEqual(1000);
    });

    it('should include stats in result', async () => {
      const context = await coordinator.prepareEnhancedContext('session-1', 'Query', 'work');

      expect(context.stats.shortTermInteractions).toBeDefined();
      expect(context.stats.longTermFacts).toBeDefined();
      expect(context.stats.episodesRetrieved).toBeDefined();
      expect(context.stats.workingMemorySlots).toBeDefined();
    });

    it('should return minimal context on error', async () => {
      (episodicMemory.retrieve as jest.Mock).mockRejectedValueOnce(new Error('Error'));
      (shortTermMemory.getEnrichedContext as jest.Mock).mockRejectedValueOnce(new Error('Error'));

      const context = await coordinator.prepareEnhancedContext('session-1', 'Query', 'work');

      expect(context.parts).toEqual([]);
      expect(context.workingMemory.goal).toBe('Query');
    });
  });

  // ===========================================
  // Utility Method Tests
  // ===========================================

  describe('getSessionStats', () => {
    it('should return session statistics', () => {
      const stats = coordinator.getSessionStats('session-1');

      expect(stats.shortTerm).toBeDefined();
      expect(shortTermMemory.getStats).toHaveBeenCalled();
    });
  });

  describe('getLongTermStats', () => {
    it('should return long-term memory statistics', async () => {
      const stats = await coordinator.getLongTermStats('work');

      expect(stats).toBeDefined();
      expect(longTermMemory.getStats).toHaveBeenCalledWith('work');
    });
  });

  describe('forceConsolidation', () => {
    it('should trigger consolidation', async () => {
      await coordinator.forceConsolidation('work');

      expect(longTermMemory.consolidate).toHaveBeenCalledWith('work');
    });
  });

  describe('addFact', () => {
    it('should add a fact to long-term memory', async () => {
      await coordinator.addFact('work', 'preference', 'User prefers dark mode', 0.9);

      expect(longTermMemory.addFact).toHaveBeenCalledWith('work', {
        factType: 'preference',
        content: 'User prefers dark mode',
        confidence: 0.9,
        source: 'explicit',
      });
    });

    it('should use default confidence', async () => {
      await coordinator.addFact('personal', 'knowledge', 'User knows Python');

      expect(longTermMemory.addFact).toHaveBeenCalledWith('personal', expect.objectContaining({
        confidence: 0.8,
      }));
    });
  });

  describe('getFacts', () => {
    it('should retrieve facts from long-term memory', async () => {
      await coordinator.getFacts('work');

      expect(longTermMemory.getFacts).toHaveBeenCalledWith('work');
    });
  });

  describe('getPatterns', () => {
    it('should retrieve patterns from long-term memory', async () => {
      await coordinator.getPatterns('work');

      expect(longTermMemory.getPatterns).toHaveBeenCalledWith('work');
    });
  });

  // ===========================================
  // Singleton Tests
  // ===========================================

  describe('memoryCoordinator singleton', () => {
    it('should be defined', () => {
      expect(memoryCoordinator).toBeDefined();
      expect(memoryCoordinator).toBeInstanceOf(MemoryCoordinator);
    });
  });
});
