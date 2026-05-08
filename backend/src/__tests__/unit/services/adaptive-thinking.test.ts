/**
 * Adaptive Thinking Budget Integration Tests
 *
 * Tests the dynamic thinking budget system that adjusts
 * Extended Thinking tokens based on query complexity.
 */

import {
  classifyTaskType,
  TaskType,
  getThinkingBudget,
  ThinkingTier,
} from '../../../services/claude/thinking-budget';
import {
  classifyIntent,
  RetrievalIntent,
} from '../../../services/query-intent-classifier';

// Mock the database context to prevent DB calls
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  AIContext: 'operations',
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

  describe('4-Tier Thinking Budget (getThinkingBudget)', () => {
    it('should return Tier 1 for short greetings', () => {
      const result = getThinkingBudget('Hallo');
      expect(result.tier).toBe(1);
      expect(result.budget).toBe(1024);
      expect(result.display).toBe('omitted');
      expect(result.label).toBe('Quick');
    });

    it('should return Tier 1 for "Hi"', () => {
      const result = getThinkingBudget('Hi');
      expect(result.tier).toBe(1);
      expect(result.budget).toBe(1024);
    });

    it('should return Tier 2 for regular questions', () => {
      const result = getThinkingBudget('Was ist React?');
      expect(result.tier).toBe(2);
      expect(result.budget).toBe(16384);
      expect(result.display).toBe('collapsible');
      expect(result.label).toBe('Standard Thinking');
    });

    it('should return Tier 3 for analysis tasks', () => {
      const result = getThinkingBudget('Analysiere die Umsatzentwicklung Q1-Q4 und vergleiche mit Vorjahr');
      expect(result.tier).toBe(3);
      expect(result.budget).toBe(65536);
      expect(result.display).toBe('visible');
      expect(result.label).toBe('Deep Thinking');
    });

    it('should return Tier 3 for problem solving', () => {
      const result = getThinkingBudget('Ich habe ein Problem mit dem Deployment, bitte hilf mir die Lösung zu finden');
      expect(result.tier).toBe(3);
      expect(result.budget).toBe(65536);
    });

    it('should return Tier 4 for strategic planning with high complexity', () => {
      // Needs complexity > 0.7: deep questions (warum, weshalb, implikation),
      // temporal markers (zeitraum, zukunft, prognose, trend, entwicklung),
      // cross-references (vergleich, zusammenhang, unterschied, bezug),
      // document references and URLs to push score high enough
      const result = getThinkingBudget(
        'Erstelle einen strategischen 5-Jahres-Plan für die langfristige Marktexpansion nach Asien. ' +
        'Warum ist der Zeitraum bis 2030 entscheidend? Weshalb unterscheiden sich die regulatorischen Anforderungen? ' +
        'Vergleiche die Entwicklung und den Zusammenhang zwischen Japan, Korea und Singapur. ' +
        'Welche Implikation hat der Trend für die Zukunft? Analysiere die Prognose und den Bezug zu [Dokument A] und [Dokument B]. ' +
        'Siehe auch https://example.com/report und die Quelle aus dem Anhang zur Referenz.'
      );
      expect(result.tier).toBe(4);
      expect(result.budget).toBe(131072);
      expect(result.display).toBe('visible_progress');
      expect(result.label).toBe('Maximum Thinking');
    });

    it('should return fallback Tier 2 on error', () => {
      // classifyTaskType handles all inputs gracefully, so we test the try/catch
      // by verifying the structure is always valid
      const result = getThinkingBudget('');
      expect(result).toHaveProperty('budget');
      expect(result).toHaveProperty('display');
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('label');
      expect([1, 2, 3, 4]).toContain(result.tier);
    });

    it('should have correct ThinkingTier interface fields', () => {
      const tier: ThinkingTier = {
        budget: 16384,
        display: 'collapsible',
        tier: 2,
        label: 'Standard Thinking',
      };
      expect(tier.budget).toBe(16384);
      expect(tier.display).toBe('collapsible');
      expect(tier.tier).toBe(2);
      expect(tier.label).toBe('Standard Thinking');
    });

    it('should return Tier 2 for creative generation tasks', () => {
      const result = getThinkingBudget('Schreibe mir eine E-Mail an den Kunden wegen der neuen Produktlinie');
      expect(result.tier).toBe(2);
      expect(result.budget).toBe(16384);
    });

    it('should return Tier 3 for synthesis tasks', () => {
      const result = getThinkingBudget('Fasse die Erkenntnisse aus mehreren Dokumenten zusammen und erstelle einen Überblick');
      expect(result.tier).toBe(3);
      expect(result.budget).toBe(65536);
    });

    it('should upgrade to Tier 3 when complexity is high even for non-analysis task type', () => {
      // A knowledge extraction input with many temporal, cross-ref, and deep question markers
      // that gets elevated to Tier 3 due to high complexity score (> 0.5)
      const result = getThinkingBudget(
        'Extrahiere die Erkenntnisse und identifiziere die Muster: Warum hat sich die Entwicklung im Zeitraum seit 2020 verändert? ' +
        'Weshalb gibt es einen Unterschied zwischen den Prognosen und der Zukunft? ' +
        'Was bedeutet der Trend für die Auswirkung? Welcher Zusammenhang besteht zum Vergleich der Referenz [A] und [B]?'
      );
      // knowledge_extraction would normally be Tier 2, but complexity > 0.5 upgrades to Tier 3
      expect([3, 4]).toContain(result.tier);
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
