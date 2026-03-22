/**
 * Global Workspace Theory (GWT) Engine Tests
 * Phase 127, Task 2 — TDD
 *
 * Tests cover:
 * - Always-include module handling
 * - Competitive module selection by salience
 * - maxModules limit enforcement
 * - Module timeout handling
 * - Fallback when all salience < threshold
 * - Proportional token allocation
 * - Edge cases (empty list, all failing)
 */

import {
  GlobalWorkspace,
  DEFAULT_GWT_CONFIG,
} from '../../../../services/reasoning/global-workspace';
import type {
  WorkspaceModule,
  QueryAnalysis,
  ModuleContext,
  SalienceResult,
  GWTConfig,
} from '../../../../services/reasoning/global-workspace';

// ─── Mock logger ─────────────────────────────────────────────────────────────
jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeModule(
  id: string,
  salience: number,
  content: string,
  alwaysInclude = false,
  delayMs = 0,
): WorkspaceModule {
  return {
    id,
    name: `Module ${id}`,
    alwaysInclude,
    computeSalience: jest.fn(async (_q, _a, _c): Promise<SalienceResult> => {
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      return { score: salience, reasoning: `test ${id}`, estimatedTokens: 200 };
    }),
    generateContent: jest.fn(async (): Promise<string> => {
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      return content;
    }),
  };
}

const DEFAULT_ANALYSIS: QueryAnalysis = {
  intent: 'question',
  domain: 'general',
  complexity: 0.5,
  temporalReference: null,
  entityMentions: [],
  isFollowUp: false,
  expectedOutputType: 'text',
  language: 'de',
};

const DEFAULT_CTX: ModuleContext = {
  aiContext: 'personal',
  userId: 'user-1',
  sessionId: 'session-1',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GlobalWorkspace', () => {
  describe('DEFAULT_GWT_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_GWT_CONFIG.maxTotalTokens).toBe(12000);
      expect(DEFAULT_GWT_CONFIG.reservedTokens).toBe(600);
      expect(DEFAULT_GWT_CONFIG.moduleTimeoutMs).toBe(2000);
      expect(DEFAULT_GWT_CONFIG.maxModules).toBe(4);
      expect(DEFAULT_GWT_CONFIG.fallbackThreshold).toBe(0.2);
    });
  });

  describe('assembleContext — always-include modules', () => {
    it('always includes alwaysInclude modules regardless of salience', async () => {
      const always = makeModule('always', 0.0, 'always content', true);
      const competitive = makeModule('comp', 0.8, 'comp content');
      const gw = new GlobalWorkspace([always, competitive]);

      const result = await gw.assembleContext('test query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.selectedModules).toContain('always');
      expect(result.assembledContext).toContain('always content');
    });

    it('includes always-include module even when competitive modules score higher', async () => {
      const always = makeModule('core', 1.0, '[CORE]', true);
      const comps = Array.from({ length: 5 }, (_, i) =>
        makeModule(`m${i}`, 0.9 - i * 0.1, `content-${i}`),
      );
      const gw = new GlobalWorkspace([always, ...comps]);

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.selectedModules).toContain('core');
    });

    it('places always-include modules before competitive modules in assembled context', async () => {
      const always = makeModule('always', 1.0, 'ALWAYS_CONTENT', true);
      const comp = makeModule('comp', 0.9, 'COMP_CONTENT');
      const gw = new GlobalWorkspace([comp, always]); // intentionally reversed order

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      const alwaysPos = result.assembledContext.indexOf('ALWAYS_CONTENT');
      const compPos = result.assembledContext.indexOf('COMP_CONTENT');
      expect(alwaysPos).toBeLessThan(compPos);
    });
  });

  describe('assembleContext — competitive module selection', () => {
    it('selects modules with the highest salience scores', async () => {
      const low = makeModule('low', 0.1, 'low content');
      const high = makeModule('high', 0.9, 'high content');
      const mid = makeModule('mid', 0.5, 'mid content');
      const gw = new GlobalWorkspace([low, high, mid], { maxModules: 1 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.selectedModules).toContain('high');
      expect(result.selectedModules).not.toContain('low');
    });

    it('records salience scores for all modules in result', async () => {
      const m1 = makeModule('m1', 0.8, 'c1');
      const m2 = makeModule('m2', 0.3, 'c2');
      const gw = new GlobalWorkspace([m1, m2]);

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.salienceScores['m1']).toBeCloseTo(0.8);
      expect(result.salienceScores['m2']).toBeCloseTo(0.3);
    });

    it('includes content only from selected modules', async () => {
      const selected = makeModule('sel', 0.9, 'selected content');
      const excluded = makeModule('excl', 0.1, 'excluded content');
      const gw = new GlobalWorkspace([selected, excluded], { maxModules: 1, fallbackThreshold: 0.05 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.assembledContext).toContain('selected content');
      expect(result.assembledContext).not.toContain('excluded content');
    });
  });

  describe('assembleContext — maxModules limit', () => {
    it('selects at most maxModules competitive modules', async () => {
      const modules = Array.from({ length: 6 }, (_, i) =>
        makeModule(`m${i}`, 0.9 - i * 0.05, `content-${i}`),
      );
      const gw = new GlobalWorkspace(modules, { maxModules: 3 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      // Only 3 competitive modules should be selected
      expect(result.selectedModules.length).toBeLessThanOrEqual(3);
    });

    it('respects maxModules = 1', async () => {
      const modules = Array.from({ length: 4 }, (_, i) =>
        makeModule(`m${i}`, 0.9 - i * 0.1, `c${i}`),
      );
      const gw = new GlobalWorkspace(modules, { maxModules: 1 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.selectedModules.length).toBe(1);
      expect(result.selectedModules[0]).toBe('m0'); // highest salience
    });
  });

  describe('assembleContext — timeout handling', () => {
    it('handles module salience timeout gracefully (returns 0 salience)', async () => {
      const slow = makeModule('slow', 0.9, 'slow content', false, 3000); // exceeds 2s timeout
      const fast = makeModule('fast', 0.5, 'fast content');
      const gw = new GlobalWorkspace([slow, fast], { moduleTimeoutMs: 100 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      // Slow module should have 0 salience due to timeout
      expect(result.salienceScores['slow']).toBe(0);
    }, 10000);

    it('still returns a valid result when some modules time out', async () => {
      const slow = makeModule('slow', 0.9, 'slow', false, 5000);
      const fast = makeModule('fast', 0.7, 'fast content');
      const gw = new GlobalWorkspace([slow, fast], { moduleTimeoutMs: 50 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result).toBeDefined();
      expect(result.assembledContext).toBeDefined();
    }, 10000);
  });

  describe('assembleContext — fallback', () => {
    it('sets usedFallback=true when best competitive salience < fallbackThreshold', async () => {
      const m1 = makeModule('m1', 0.05, 'c1');
      const m2 = makeModule('m2', 0.03, 'c2');
      const gw = new GlobalWorkspace([m1, m2], { fallbackThreshold: 0.2 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.usedFallback).toBe(true);
    });

    it('still includes top 2 modules when fallback is triggered', async () => {
      const m1 = makeModule('m1', 0.1, 'top1');
      const m2 = makeModule('m2', 0.08, 'top2');
      const m3 = makeModule('m3', 0.02, 'low');
      const gw = new GlobalWorkspace([m1, m2, m3], { fallbackThreshold: 0.2 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.usedFallback).toBe(true);
      expect(result.selectedModules).toContain('m1');
      expect(result.selectedModules).toContain('m2');
    });

    it('does NOT set usedFallback when best salience >= fallbackThreshold', async () => {
      const m1 = makeModule('m1', 0.5, 'good content');
      const gw = new GlobalWorkspace([m1], { fallbackThreshold: 0.2 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.usedFallback).toBe(false);
    });
  });

  describe('assembleContext — token allocation', () => {
    it('always-include modules receive reservedTokens budget', async () => {
      const always = makeModule('always', 1.0, 'core', true);
      // Spy on generateContent to check tokenBudget arg
      const spy = jest.spyOn(always, 'generateContent');
      const gw = new GlobalWorkspace([always], { reservedTokens: 600 });

      await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(spy).toHaveBeenCalled();
      // First arg is query (string), second is tokenBudget (number), third is context
      const tokenBudget = spy.mock.calls[0][1];
      expect(tokenBudget).toBe(600); // single always-include gets all reserved tokens
    });

    it('competitive modules share remaining tokens proportionally', async () => {
      const always = makeModule('always', 1.0, 'core', true);
      const m1 = makeModule('m1', 0.8, 'c1'); // gets larger share
      const m2 = makeModule('m2', 0.2, 'c2'); // gets smaller share
      const spy1 = jest.spyOn(m1, 'generateContent');
      const spy2 = jest.spyOn(m2, 'generateContent');
      const gw = new GlobalWorkspace([always, m1, m2], {
        maxTotalTokens: 1200,
        reservedTokens: 200,
        maxModules: 2,
      });

      await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      const budget1 = spy1.mock.calls[0]?.[1] ?? 0;
      const budget2 = spy2.mock.calls[0]?.[1] ?? 0;
      // m1 should get more tokens than m2 (proportional to salience)
      expect(budget1).toBeGreaterThan(budget2);
      // Combined budgets should be close to (maxTotal - reserved) = 1000
      expect(budget1 + budget2).toBeCloseTo(1000, -1);
    });

    it('tokenUsage in result is approximately the total allocated', async () => {
      const m1 = makeModule('m1', 0.6, 'content one');
      const gw = new GlobalWorkspace([m1], { maxTotalTokens: 1000, reservedTokens: 0 });

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.tokenUsage).toBeGreaterThan(0);
      expect(result.tokenUsage).toBeLessThanOrEqual(1000);
    });
  });

  describe('assembleContext — edge cases', () => {
    it('handles empty module list gracefully', async () => {
      const gw = new GlobalWorkspace([]);

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.assembledContext).toBe('');
      expect(result.selectedModules).toHaveLength(0);
      expect(result.tokenUsage).toBe(0);
    });

    it('handles all modules failing (rejecting) gracefully', async () => {
      const badModule: WorkspaceModule = {
        id: 'bad',
        name: 'Bad Module',
        alwaysInclude: false,
        computeSalience: jest.fn().mockRejectedValue(new Error('fail')),
        generateContent: jest.fn().mockRejectedValue(new Error('fail')),
      };
      const gw = new GlobalWorkspace([badModule]);

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result).toBeDefined();
      expect(result.salienceScores['bad']).toBe(0);
    });

    it('handles only always-include modules (no competitive)', async () => {
      const always = makeModule('always', 1.0, 'core content', true);
      const gw = new GlobalWorkspace([always]);

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(result.selectedModules).toContain('always');
      expect(result.assembledContext).toContain('core content');
      expect(result.usedFallback).toBe(false);
    });

    it('multiple always-include modules each get equal share of reservedTokens', async () => {
      const a1 = makeModule('a1', 1.0, 'core1', true);
      const a2 = makeModule('a2', 1.0, 'core2', true);
      const spy1 = jest.spyOn(a1, 'generateContent');
      const spy2 = jest.spyOn(a2, 'generateContent');
      const gw = new GlobalWorkspace([a1, a2], { reservedTokens: 600, maxTotalTokens: 1200 });

      await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      const budget1 = spy1.mock.calls[0]?.[1] ?? 0;
      const budget2 = spy2.mock.calls[0]?.[1] ?? 0;
      expect(budget1).toBe(300);
      expect(budget2).toBe(300);
    });

    it('passes QueryAnalysis to computeSalience', async () => {
      const m = makeModule('m', 0.5, 'content');
      const gw = new GlobalWorkspace([m]);

      const analysis: QueryAnalysis = {
        ...DEFAULT_ANALYSIS,
        intent: 'task',
        domain: 'work',
      };
      await gw.assembleContext('query', analysis, DEFAULT_CTX);

      const computeSpy = m.computeSalience as jest.Mock;
      expect(computeSpy).toHaveBeenCalledWith('query', analysis, DEFAULT_CTX);
    });

    it('passes ModuleContext to generateContent', async () => {
      const m = makeModule('m', 0.5, 'content');
      const gw = new GlobalWorkspace([m]);

      await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      const genSpy = m.generateContent as jest.Mock;
      expect(genSpy).toHaveBeenCalledWith('query', expect.any(Number), DEFAULT_CTX);
    });
  });

  describe('GWTResult shape', () => {
    it('result contains all required fields', async () => {
      const m = makeModule('m', 0.7, 'content');
      const gw = new GlobalWorkspace([m]);

      const result = await gw.assembleContext('query', DEFAULT_ANALYSIS, DEFAULT_CTX);

      expect(typeof result.assembledContext).toBe('string');
      expect(Array.isArray(result.selectedModules)).toBe(true);
      expect(typeof result.salienceScores).toBe('object');
      expect(typeof result.tokenUsage).toBe('number');
      expect(typeof result.usedFallback).toBe('boolean');
    });
  });
});
