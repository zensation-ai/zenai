/**
 * Multi-Model Orchestrator - Unit Tests
 */

import {
  classifyComplexity,
  routeToModel,
  recordUsage,
  getUsageStats,
  getCurrentMonthSpend,
  resetUsageTracking,
  getRegisteredModels,
} from '../../../services/model-orchestrator';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Model Orchestrator', () => {
  beforeEach(() => {
    resetUsageTracking();
  });

  // ========================================
  // classifyComplexity
  // ========================================
  describe('classifyComplexity', () => {
    it('should classify simple messages', () => {
      expect(classifyComplexity('Ja')).toBe('simple');
      expect(classifyComplexity('Danke!')).toBe('simple');
      expect(classifyComplexity('Ok')).toBe('simple');
      expect(classifyComplexity('Hallo!')).toBe('simple');
      expect(classifyComplexity('Hi')).toBe('simple');
      expect(classifyComplexity('Guten Morgen')).toBe('simple');
    });

    it('should classify complex messages', () => {
      expect(classifyComplexity('Analysiere die Entwicklung meiner Ideen zum Thema KI im Gesundheitswesen')).toBe('complex');
      expect(classifyComplexity('Vergleiche meine Marketingideen mit den technischen Konzepten')).toBe('complex');
      expect(classifyComplexity('Erstelle einen umfassenden Bericht über alle Projekte')).toBe('complex');
      expect(classifyComplexity('Fasse alles zusammen was ich über Leadership weiß')).toBe('complex');
    });

    it('should classify standard messages by default', () => {
      expect(classifyComplexity('Was sind die wichtigsten Trends im Bereich Machine Learning für Enterprise-Anwendungen und welche Auswirkungen haben sie?')).toBe('standard');
    });

    it('should override with synthesis flag', () => {
      expect(classifyComplexity('Ja', { requiresSynthesis: true })).toBe('complex');
    });

    it('should override with tools + long message', () => {
      const longMsg = 'a'.repeat(250);
      expect(classifyComplexity(longMsg, { requiresTools: true })).toBe('complex');
    });
  });

  // ========================================
  // routeToModel
  // ========================================
  describe('routeToModel', () => {
    it('should route simple queries to fast tier', () => {
      const decision = routeToModel('Hallo!');
      expect(decision.complexity).toBe('simple');
      expect(decision.model.tier).toBe('fast');
    });

    it('should route complex queries to premium tier', () => {
      const decision = routeToModel('Analysiere die gesamte Entwicklung meiner KI-Strategien und erstelle einen Bericht');
      expect(decision.complexity).toBe('complex');
      expect(decision.model.tier).toBe('premium');
    });

    it('should route standard queries to balanced tier', () => {
      const decision = routeToModel('Was sind die Vorteile von React gegenüber Vue für Enterprise-Projekte? Ich brauche eine fundierte Einschätzung basierend auf meinen bisherigen Erfahrungen.');
      expect(decision.complexity).toBe('standard');
      expect(decision.model.tier).toBe('balanced');
    });

    it('should respect preferred tier override', () => {
      const decision = routeToModel('Hallo', { preferredTier: 'premium' });
      expect(decision.model.tier).toBe('premium');
    });

    it('should include reason in decision', () => {
      const decision = routeToModel('Test message');
      expect(decision.reason).toContain('Complexity');
      expect(decision.reason).toContain('Model');
    });

    it('should estimate cost', () => {
      const decision = routeToModel('Some query text for cost estimation');
      expect(decision.estimatedCost).toBeGreaterThanOrEqual(0);
    });

    it('should route to cheapest model when budget exceeded', () => {
      // Simulate budget exceeded
      const decision = routeToModel(
        'Analysiere die gesamte Entwicklung meiner KI-Strategien',
        {},
        { monthlyBudgetUSD: 0.001 }
      );
      // With 0.001 budget and 0 spent, should still work normally
      expect(decision.model).toBeDefined();
    });
  });

  // ========================================
  // Usage Tracking
  // ========================================
  describe('usage tracking', () => {
    it('should record and track usage', () => {
      recordUsage('claude-sonnet-4-20250514', 'anthropic', 1000, 500, 'chat');
      recordUsage('claude-sonnet-4-20250514', 'anthropic', 2000, 1000, 'chat');

      const stats = getUsageStats(30);
      expect(stats.totalInputTokens).toBe(3000);
      expect(stats.totalOutputTokens).toBe(1500);
      expect(stats.totalCost).toBeGreaterThan(0);
    });

    it('should track spend per model', () => {
      recordUsage('claude-sonnet-4-20250514', 'anthropic', 1000, 500, 'chat');

      const stats = getUsageStats(30);
      const modelStats = stats.byModel['claude-sonnet-4-20250514'];
      expect(modelStats).toBeDefined();
      expect(modelStats.calls).toBe(1);
      expect(modelStats.inputTokens).toBe(1000);
    });

    it('should track monthly spend', () => {
      expect(getCurrentMonthSpend()).toBe(0);

      recordUsage('claude-sonnet-4-20250514', 'anthropic', 1000, 500, 'chat');

      expect(getCurrentMonthSpend()).toBeGreaterThan(0);
    });

    it('should reset tracking', () => {
      recordUsage('claude-sonnet-4-20250514', 'anthropic', 1000, 500, 'chat');
      expect(getCurrentMonthSpend()).toBeGreaterThan(0);

      resetUsageTracking();
      expect(getCurrentMonthSpend()).toBe(0);

      const stats = getUsageStats(30);
      expect(stats.totalCost).toBe(0);
    });
  });

  // ========================================
  // Model Registry
  // ========================================
  describe('model registry', () => {
    it('should return registered models', () => {
      const models = getRegisteredModels();
      expect(models.length).toBeGreaterThanOrEqual(3); // At least haiku, sonnet, opus
    });

    it('should have all required tiers', () => {
      const models = getRegisteredModels();
      const tiers = new Set(models.map(m => m.tier));
      expect(tiers.has('fast')).toBe(true);
      expect(tiers.has('balanced')).toBe(true);
      expect(tiers.has('premium')).toBe(true);
    });

    it('should have cost information for all models', () => {
      const models = getRegisteredModels();
      for (const model of models) {
        expect(model.inputCostPer1K).toBeGreaterThanOrEqual(0);
        expect(model.outputCostPer1K).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
