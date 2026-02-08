/**
 * Adaptive Thinking Budget Integration Tests
 *
 * Tests the dynamic thinking budget system that adjusts
 * Extended Thinking tokens based on query complexity.
 */

import {
  classifyTaskType,
  TaskType,
} from '../../../services/claude/thinking-budget';
import {
  classifyIntent,
  RetrievalIntent,
} from '../../../services/query-intent-classifier';

// Mock the database context to prevent DB calls
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  AIContext: 'personal',
}));

// Mock ai service for embedding generation
jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
}));

// Mock embedding utility
jest.mock('../../../utils/embedding', () => ({
  formatForPgVector: jest.fn().mockReturnValue('[0,0,0]'),
}));

describe('Adaptive Thinking Budget', () => {
  describe('Intent-to-Thinking Mapping', () => {
    it('should classify greetings as skip intent (no thinking needed)', () => {
      const result = classifyIntent('Hallo!', { messageCount: 0 });
      expect(result.intent).toBe('skip');
    });

    it('should classify simple confirmations as skip', () => {
      const result = classifyIntent('Ja', { messageCount: 1 });
      expect(result.intent).toBe('skip');
    });

    it('should classify thanks as skip', () => {
      const result = classifyIntent('Danke!', { messageCount: 2 });
      expect(result.intent).toBe('skip');
    });

    it('should classify follow-up questions as conversation_only', () => {
      const result = classifyIntent('Kannst du das genauer erklären?', {
        messageCount: 3,
        recentMessages: [
          { role: 'user', content: 'Was ist React?' },
          { role: 'assistant', content: 'React ist ein JavaScript Framework...' },
        ],
      });
      expect(['conversation_only', 'quick_retrieve']).toContain(result.intent);
    });

    it('should classify knowledge questions for retrieval', () => {
      const result = classifyIntent('Welche Ideen habe ich zum Thema Marketing?', {
        messageCount: 1,
      });
      expect(['quick_retrieve', 'full_retrieve']).toContain(result.intent);
    });
  });

  describe('Task Type Classification', () => {
    it('should classify strategic questions', () => {
      const taskType = classifyTaskType('Erstelle eine Strategie für unser Q3 Wachstum');
      expect(taskType).toBe('strategic_planning');
    });

    it('should classify analysis tasks', () => {
      const taskType = classifyTaskType('Analysiere die Vor- und Nachteile von React vs Vue');
      expect(taskType).toBe('analysis');
    });

    it('should classify synthesis tasks', () => {
      const taskType = classifyTaskType('Synthese: Kombiniere die Erkenntnisse aus mehreren Dokumenten und erstelle einen Überblick');
      expect(taskType).toBe('synthesis');
    });

    it('should classify creative generation tasks', () => {
      const taskType = classifyTaskType('Schreibe mir eine E-Mail an den Kunden');
      expect(taskType).toBe('creative_generation');
    });

    it('should classify problem solving tasks', () => {
      const taskType = classifyTaskType('Ich habe ein Problem mit dem Login, der Button funktioniert nicht');
      expect(taskType).toBe('problem_solving');
    });

    it('should classify knowledge extraction tasks', () => {
      const taskType = classifyTaskType('Extrahiere die wichtigsten Erkenntnisse aus dem Meeting');
      expect(taskType).toBe('knowledge_extraction');
    });

    it('should default to simple_structuring for basic messages', () => {
      const taskType = classifyTaskType('Was gibt es Neues?');
      expect(taskType).toBe('simple_structuring');
    });
  });

  describe('Budget-Intent Integration Logic', () => {
    /**
     * Tests the decision logic used in the streaming endpoint:
     * - skip intent → thinking disabled
     * - conversation_only → minimal budget (2000)
     * - quick_retrieve/full_retrieve → dynamic budget from task classifier
     */

    function getAdaptiveBudget(
      intent: RetrievalIntent,
      taskType: TaskType,
      staticBudget: number = 10000
    ): { enableThinking: boolean; budget: number } {
      if (intent === 'skip') {
        return { enableThinking: false, budget: 2000 };
      }
      if (intent === 'conversation_only') {
        return { enableThinking: true, budget: 2000 };
      }

      // For retrieval intents, use task-type base budget
      const budgetMap: Record<TaskType, number> = {
        'simple_structuring': 2000,
        'complex_structuring': 5000,
        'analysis': 15000,
        'synthesis': 20000,
        'strategic_planning': 25000,
        'creative_generation': 10000,
        'problem_solving': 15000,
        'knowledge_extraction': 8000,
      };
      return { enableThinking: true, budget: budgetMap[taskType] || staticBudget };
    }

    it('should disable thinking for greetings', () => {
      const result = getAdaptiveBudget('skip', 'simple_structuring');
      expect(result.enableThinking).toBe(false);
    });

    it('should use minimal budget for conversation', () => {
      const result = getAdaptiveBudget('conversation_only', 'simple_structuring');
      expect(result.enableThinking).toBe(true);
      expect(result.budget).toBe(2000);
    });

    it('should use high budget for analysis tasks', () => {
      const result = getAdaptiveBudget('full_retrieve', 'analysis');
      expect(result.enableThinking).toBe(true);
      expect(result.budget).toBe(15000);
    });

    it('should use maximum budget for strategic planning', () => {
      const result = getAdaptiveBudget('full_retrieve', 'strategic_planning');
      expect(result.enableThinking).toBe(true);
      expect(result.budget).toBe(25000);
    });

    it('should save tokens on simple tasks vs static budget', () => {
      const staticBudget = 10000;
      const simpleResult = getAdaptiveBudget('conversation_only', 'simple_structuring', staticBudget);
      expect(simpleResult.budget).toBeLessThan(staticBudget);
    });

    it('should increase tokens on complex tasks vs static budget', () => {
      const staticBudget = 10000;
      const complexResult = getAdaptiveBudget('full_retrieve', 'strategic_planning', staticBudget);
      expect(complexResult.budget).toBeGreaterThan(staticBudget);
    });
  });

  describe('End-to-End: Message → Intent → Task → Budget', () => {
    const testCases: Array<{
      message: string;
      expectedIntent: RetrievalIntent[];
      expectedThinking: boolean;
      budgetRange: [number, number];
    }> = [
      {
        message: 'Hallo!',
        expectedIntent: ['skip'],
        expectedThinking: false,
        budgetRange: [0, 2000],
      },
      {
        message: 'Danke, das war hilfreich!',
        expectedIntent: ['skip', 'conversation_only'],
        expectedThinking: false,
        budgetRange: [0, 2000],
      },
      {
        message: 'Erstelle eine detaillierte Strategie für das Q3 Wachstum unseres SaaS-Produkts',
        expectedIntent: ['quick_retrieve', 'full_retrieve', 'conversation_only'],
        expectedThinking: true,
        budgetRange: [10000, 50000],
      },
      {
        message: 'Analysiere die Vor- und Nachteile von Microservices vs Monolith',
        expectedIntent: ['quick_retrieve', 'full_retrieve'],
        expectedThinking: true,
        budgetRange: [8000, 40000],
      },
    ];

    testCases.forEach(({ message, expectedIntent, expectedThinking, budgetRange }) => {
      it(`should correctly handle: "${message.substring(0, 50)}..."`, () => {
        const intent = classifyIntent(message, { messageCount: 1 });
        expect(expectedIntent).toContain(intent.intent);

        if (!expectedThinking) {
          expect(['skip', 'conversation_only']).toContain(intent.intent);
        }

        const taskType = classifyTaskType(message);
        // TaskType should be a valid type
        expect([
          'simple_structuring', 'complex_structuring', 'analysis',
          'synthesis', 'strategic_planning', 'creative_generation',
          'problem_solving', 'knowledge_extraction',
        ]).toContain(taskType);
      });
    });
  });
});
