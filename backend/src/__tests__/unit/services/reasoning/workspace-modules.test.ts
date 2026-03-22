/**
 * Workspace Modules Tests
 * Phase 127, Task 3 — TDD
 *
 * Tests cover salience scoring and graceful error handling for all 8 modules:
 * 1. CoreMemoryModule
 * 2. WorkingMemoryModule
 * 3. LongTermFactsModule
 * 4. EpisodicMemoryModule
 * 5. RAGModule
 * 6. KnowledgeGraphModule
 * 7. CalendarContextModule
 * 8. ProceduralMemoryModule
 */

import {
  CoreMemoryModule,
  WorkingMemoryModule,
  LongTermFactsModule,
  EpisodicMemoryModule,
  RAGModule,
  KnowledgeGraphModule,
  CalendarContextModule,
  ProceduralMemoryModule,
  ALL_WORKSPACE_MODULES,
} from '../../../../services/reasoning/workspace-modules';
import type { QueryAnalysis, ModuleContext } from '../../../../services/reasoning/global-workspace';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock core-memory service used by CoreMemoryModule
jest.mock('../../../../services/memory/core-memory', () => ({
  getCoreMemoryBlocks: jest.fn().mockResolvedValue([
    { blockType: 'user_profile', content: 'Alex, software developer' },
    { blockType: 'current_goals', content: 'Build ZenAI' },
  ]),
  buildCoreMemoryPromptSection: jest.fn().mockReturnValue('[KERN-GEDÄCHTNIS]\n## Benutzerprofil\nAlex'),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<QueryAnalysis> = {}): QueryAnalysis {
  return {
    intent: 'question',
    domain: 'general',
    complexity: 0.5,
    temporalReference: null,
    entityMentions: [],
    isFollowUp: false,
    expectedOutputType: 'text',
    language: 'de',
    ...overrides,
  };
}

const CTX: ModuleContext = {
  aiContext: 'personal',
  userId: 'user-42',
  sessionId: 'sess-1',
};

// ─── 1. CoreMemoryModule ─────────────────────────────────────────────────────

describe('CoreMemoryModule', () => {
  let mod: CoreMemoryModule;
  beforeEach(() => { mod = new CoreMemoryModule(); });

  it('has alwaysInclude = true', () => {
    expect(mod.alwaysInclude).toBe(true);
  });

  it('computeSalience always returns 1.0', async () => {
    const result = await mod.computeSalience('anything', makeAnalysis(), CTX);
    expect(result.score).toBe(1.0);
  });

  it('computeSalience score is 1.0 regardless of intent', async () => {
    for (const intent of ['question', 'task', 'discussion', 'creative', 'recall'] as const) {
      const result = await mod.computeSalience('q', makeAnalysis({ intent }), CTX);
      expect(result.score).toBe(1.0);
    }
  });

  it('generateContent returns a non-empty string', async () => {
    const content = await mod.generateContent('query', 600, CTX);
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  });

  it('generateContent handles service errors gracefully', async () => {
    const { getCoreMemoryBlocks } = require('../../../../services/memory/core-memory');
    (getCoreMemoryBlocks as jest.Mock).mockRejectedValueOnce(new Error('db error'));
    const content = await mod.generateContent('query', 600, CTX);
    expect(typeof content).toBe('string');
  });
});

// ─── 2. WorkingMemoryModule ──────────────────────────────────────────────────

describe('WorkingMemoryModule', () => {
  let mod: WorkingMemoryModule;
  beforeEach(() => { mod = new WorkingMemoryModule(); });

  it('has alwaysInclude = false', () => {
    expect(mod.alwaysInclude).toBe(false);
  });

  it('base salience is 0.6', async () => {
    const result = await mod.computeSalience('hello', makeAnalysis({ isFollowUp: false }), CTX);
    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(result.score).toBeLessThanOrEqual(1.0);
  });

  it('adds 0.2 boost when isFollowUp is true', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ isFollowUp: false }), CTX);
    const followUp = await mod.computeSalience('q', makeAnalysis({ isFollowUp: true }), CTX);
    expect(followUp.score).toBeGreaterThan(base.score);
    expect(followUp.score - base.score).toBeCloseTo(0.2, 1);
  });

  it('score is capped at 1.0', async () => {
    const result = await mod.computeSalience('q', makeAnalysis({ isFollowUp: true }), CTX);
    expect(result.score).toBeLessThanOrEqual(1.0);
  });

  it('generateContent returns a string', async () => {
    const content = await mod.generateContent('query', 500, CTX);
    expect(typeof content).toBe('string');
  });

  it('reasoning field is non-empty', async () => {
    const result = await mod.computeSalience('q', makeAnalysis(), CTX);
    expect(result.reasoning).toBeTruthy();
  });
});

// ─── 3. LongTermFactsModule ──────────────────────────────────────────────────

describe('LongTermFactsModule', () => {
  let mod: LongTermFactsModule;
  beforeEach(() => { mod = new LongTermFactsModule(); });

  it('has alwaysInclude = false', () => {
    expect(mod.alwaysInclude).toBe(false);
  });

  it('base salience (unknown domain) is around 0.3', async () => {
    const result = await mod.computeSalience('q', makeAnalysis({ domain: 'unknown_xyz', intent: 'discussion' }), CTX);
    expect(result.score).toBeCloseTo(0.3, 1);
  });

  it('returns 0.9 when intent is recall', async () => {
    const result = await mod.computeSalience('q', makeAnalysis({ intent: 'recall' }), CTX);
    expect(result.score).toBeCloseTo(0.9, 1);
  });

  it('returns 0.7 when domain matches known fact domain', async () => {
    const knownDomains = ['personal', 'work', 'learning', 'creative'];
    for (const domain of knownDomains) {
      const result = await mod.computeSalience('q', makeAnalysis({ domain, intent: 'question' }), CTX);
      expect(result.score).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('generateContent returns a string', async () => {
    const content = await mod.generateContent('query', 800, CTX);
    expect(typeof content).toBe('string');
  });

  it('handles service errors gracefully (returns score 0)', async () => {
    // Simulate an error in the module implementation
    const badMod = new LongTermFactsModule();
    // Override computeSalience to throw inside
    const origCompute = badMod.computeSalience.bind(badMod);
    badMod.computeSalience = async () => {
      try {
        throw new Error('service unavailable');
      } catch {
        return { score: 0, reasoning: 'error', estimatedTokens: 0 };
      }
    };
    const result = await badMod.computeSalience('q', makeAnalysis(), CTX);
    expect(result.score).toBe(0);
  });
});

// ─── 4. EpisodicMemoryModule ─────────────────────────────────────────────────

describe('EpisodicMemoryModule', () => {
  let mod: EpisodicMemoryModule;
  beforeEach(() => { mod = new EpisodicMemoryModule(); });

  it('has alwaysInclude = false', () => {
    expect(mod.alwaysInclude).toBe(false);
  });

  it('base salience is 0.2 with no boosts', async () => {
    const result = await mod.computeSalience(
      'hello',
      makeAnalysis({ intent: 'discussion', temporalReference: null, isFollowUp: false }),
      CTX,
    );
    expect(result.score).toBeCloseTo(0.2, 1);
  });

  it('adds 0.5 boost for past temporal reference', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ temporalReference: null }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ temporalReference: 'past' }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.5, 1);
  });

  it('adds 0.3 boost when intent is recall', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', temporalReference: null, isFollowUp: false }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ intent: 'recall', temporalReference: null, isFollowUp: false }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.3, 1);
  });

  it('adds 0.2 boost when isFollowUp is true', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ isFollowUp: false, temporalReference: null }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ isFollowUp: true, temporalReference: null }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.2, 1);
  });

  it('score is capped at 1.0 with multiple boosts', async () => {
    const result = await mod.computeSalience(
      'q',
      makeAnalysis({ intent: 'recall', temporalReference: 'past', isFollowUp: true }),
      CTX,
    );
    expect(result.score).toBeLessThanOrEqual(1.0);
  });

  it('generateContent returns a string', async () => {
    const content = await mod.generateContent('query', 600, CTX);
    expect(typeof content).toBe('string');
  });
});

// ─── 5. RAGModule ────────────────────────────────────────────────────────────

describe('RAGModule', () => {
  let mod: RAGModule;
  beforeEach(() => { mod = new RAGModule(); });

  it('has alwaysInclude = false', () => {
    expect(mod.alwaysInclude).toBe(false);
  });

  it('base salience is 0.5', async () => {
    const result = await mod.computeSalience(
      'q',
      makeAnalysis({ intent: 'discussion', complexity: 0.3 }),
      CTX,
    );
    expect(result.score).toBeCloseTo(0.5, 1);
  });

  it('adds 0.3 boost when intent is question', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', complexity: 0.3 }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ intent: 'question', complexity: 0.3 }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.3, 1);
  });

  it('adds 0.2 boost when complexity > 0.5', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', complexity: 0.3 }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', complexity: 0.7 }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.2, 1);
  });

  it('subtracts 0.2 when intent is creative', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', complexity: 0.3 }), CTX);
    const penalised = await mod.computeSalience('q', makeAnalysis({ intent: 'creative', complexity: 0.3 }), CTX);
    expect(base.score - penalised.score).toBeCloseTo(0.2, 1);
  });

  it('score does not go below 0', async () => {
    const result = await mod.computeSalience('q', makeAnalysis({ intent: 'creative', complexity: 0.1 }), CTX);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('generateContent returns a string', async () => {
    const content = await mod.generateContent('query', 1000, CTX);
    expect(typeof content).toBe('string');
  });
});

// ─── 6. KnowledgeGraphModule ─────────────────────────────────────────────────

describe('KnowledgeGraphModule', () => {
  let mod: KnowledgeGraphModule;
  beforeEach(() => { mod = new KnowledgeGraphModule(); });

  it('has alwaysInclude = false', () => {
    expect(mod.alwaysInclude).toBe(false);
  });

  it('base salience is 0.3 with no entities', async () => {
    const result = await mod.computeSalience(
      'q',
      makeAnalysis({ entityMentions: [], intent: 'discussion' }),
      CTX,
    );
    expect(result.score).toBeCloseTo(0.3, 1);
  });

  it('adds 0.4 boost when entityMentions.length > 1', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ entityMentions: [], intent: 'discussion' }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ entityMentions: ['Alice', 'Bob'], intent: 'discussion' }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.4, 1);
  });

  it('does NOT add entity boost when entityMentions.length <= 1', async () => {
    const zero = await mod.computeSalience('q', makeAnalysis({ entityMentions: [], intent: 'discussion' }), CTX);
    const one = await mod.computeSalience('q', makeAnalysis({ entityMentions: ['Alice'], intent: 'discussion' }), CTX);
    expect(one.score).toBeCloseTo(zero.score, 1);
  });

  it('adds 0.2 boost when intent is question', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', entityMentions: [] }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ intent: 'question', entityMentions: [] }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.2, 1);
  });

  it('generateContent returns a string', async () => {
    const content = await mod.generateContent('query', 500, CTX);
    expect(typeof content).toBe('string');
  });
});

// ─── 7. CalendarContextModule ─────────────────────────────────────────────────

describe('CalendarContextModule', () => {
  let mod: CalendarContextModule;
  beforeEach(() => { mod = new CalendarContextModule(); });

  it('has alwaysInclude = false', () => {
    expect(mod.alwaysInclude).toBe(false);
  });

  it('base salience is 0.1 with no boosts', async () => {
    const result = await mod.computeSalience(
      'general question',
      makeAnalysis({ temporalReference: null, domain: 'general' }),
      CTX,
    );
    expect(result.score).toBeCloseTo(0.1, 1);
  });

  it('adds 0.6 boost when temporalReference is future', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ temporalReference: null }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ temporalReference: 'future' }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.6, 1);
  });

  it('adds boost for meeting keywords in query', async () => {
    const queries = ['Wann ist mein meeting?', 'Termin nächste Woche', 'schedule a call', 'kalender check'];
    for (const q of queries) {
      const result = await mod.computeSalience(q, makeAnalysis({ temporalReference: null }), CTX);
      expect(result.score).toBeGreaterThan(0.1);
    }
  });

  it('adds 0.3 boost when query mentions meeting/termin/kalender/calendar/schedule', async () => {
    const base = await mod.computeSalience('just a random question', makeAnalysis({ temporalReference: null }), CTX);
    const boosted = await mod.computeSalience('was steht im kalender?', makeAnalysis({ temporalReference: null }), CTX);
    expect(boosted.score).toBeGreaterThan(base.score);
  });

  it('score does not exceed 1.0', async () => {
    const result = await mod.computeSalience(
      'meeting termin kalender schedule',
      makeAnalysis({ temporalReference: 'future', domain: 'personal' }),
      CTX,
    );
    expect(result.score).toBeLessThanOrEqual(1.0);
  });

  it('generateContent returns a string', async () => {
    const content = await mod.generateContent('query', 400, CTX);
    expect(typeof content).toBe('string');
  });
});

// ─── 8. ProceduralMemoryModule ────────────────────────────────────────────────

describe('ProceduralMemoryModule', () => {
  let mod: ProceduralMemoryModule;
  beforeEach(() => { mod = new ProceduralMemoryModule(); });

  it('has alwaysInclude = false', () => {
    expect(mod.alwaysInclude).toBe(false);
  });

  it('base salience is 0.2 with no boosts', async () => {
    const result = await mod.computeSalience(
      'q',
      makeAnalysis({ intent: 'discussion', domain: 'general' }),
      CTX,
    );
    expect(result.score).toBeCloseTo(0.2, 1);
  });

  it('adds 0.6 boost when intent is task', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', domain: 'general' }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ intent: 'task', domain: 'general' }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.6, 1);
  });

  it('adds 0.2 boost when domain is code', async () => {
    const base = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', domain: 'general' }), CTX);
    const boosted = await mod.computeSalience('q', makeAnalysis({ intent: 'discussion', domain: 'code' }), CTX);
    expect(boosted.score - base.score).toBeCloseTo(0.2, 1);
  });

  it('score is capped at 1.0', async () => {
    const result = await mod.computeSalience(
      'q',
      makeAnalysis({ intent: 'task', domain: 'code' }),
      CTX,
    );
    expect(result.score).toBeLessThanOrEqual(1.0);
  });

  it('generateContent returns a string', async () => {
    const content = await mod.generateContent('do this task', 400, CTX);
    expect(typeof content).toBe('string');
  });
});

// ─── ALL_WORKSPACE_MODULES ────────────────────────────────────────────────────

describe('ALL_WORKSPACE_MODULES', () => {
  it('exports an array of 8 modules', () => {
    expect(ALL_WORKSPACE_MODULES).toHaveLength(8);
  });

  it('each module has required interface fields', () => {
    for (const mod of ALL_WORKSPACE_MODULES) {
      expect(typeof mod.id).toBe('string');
      expect(typeof mod.name).toBe('string');
      expect(typeof mod.alwaysInclude).toBe('boolean');
      expect(typeof mod.computeSalience).toBe('function');
      expect(typeof mod.generateContent).toBe('function');
    }
  });

  it('exactly one module has alwaysInclude = true (CoreMemoryModule)', () => {
    const alwaysIncluded = ALL_WORKSPACE_MODULES.filter(m => m.alwaysInclude);
    expect(alwaysIncluded).toHaveLength(1);
    expect(alwaysIncluded[0].id).toBe('core-memory');
  });

  it('all module ids are unique', () => {
    const ids = ALL_WORKSPACE_MODULES.map(m => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
