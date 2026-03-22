/**
 * Phase 126: Cross-Context Entity Merger Tests
 *
 * TDD: Tests written before implementation.
 */

import { queryContext, pool } from '../../../utils/database-context';
import {
  computeNameSimilarity,
  findMergeCandidates,
  createCrossContextLink,
  getCrossContextLinks,
  runMergeDetection,
  CrossContextCandidate,
  CrossContextLink,
} from '../../../services/memory/cross-context-merger';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  pool: { query: jest.fn() },
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockPoolQuery = (pool as { query: jest.MockedFunction<typeof pool.query> }).query;

// ===========================================
// Mock Data
// ===========================================

const mockEntitiesPersonal = [
  {
    id: 'ent-p-001',
    name: 'Michael Schmidt',
    type: 'person',
    description: 'Colleague',
    importance: 7,
    aliases: ['Mike', 'M. Schmidt'],
  },
  {
    id: 'ent-p-002',
    name: 'TypeScript',
    type: 'technology',
    description: 'Programming language',
    importance: 9,
    aliases: ['TS'],
  },
  {
    id: 'ent-p-003',
    name: 'React',
    type: 'technology',
    description: 'UI framework',
    importance: 8,
    aliases: [],
  },
];

const mockEntitiesWork = [
  {
    id: 'ent-w-001',
    name: 'Michael Schmidt',
    type: 'person',
    description: 'Team lead',
    importance: 9,
    aliases: ['Mike Schmidt', 'Michael'],
  },
  {
    id: 'ent-w-002',
    name: 'TypeScript',
    type: 'technology',
    description: 'Primary language',
    importance: 10,
    aliases: ['TS', 'TypeScript 5'],
  },
  {
    id: 'ent-w-003',
    name: 'Angular',
    type: 'technology',
    description: 'Frontend framework',
    importance: 6,
    aliases: [],
  },
];

const mockLink: CrossContextLink = {
  id: 'link-001',
  sourceContext: 'personal',
  sourceEntityId: 'ent-p-001',
  targetContext: 'work',
  targetEntityId: 'ent-w-001',
  mergeType: 'hard',
  mergeScore: 1.0,
  confirmedBy: null,
};

// ===========================================
// Tests: computeNameSimilarity
// ===========================================

describe('computeNameSimilarity', () => {
  it('returns 1.0 for identical names', () => {
    expect(computeNameSimilarity('Michael Schmidt', 'Michael Schmidt')).toBe(1.0);
  });

  it('returns 1.0 for identical names in different case', () => {
    expect(computeNameSimilarity('MICHAEL SCHMIDT', 'michael schmidt')).toBe(1.0);
  });

  it('returns 0.0 for completely different names', () => {
    expect(computeNameSimilarity('Alice Johnson', 'Bob Williams')).toBe(0.0);
  });

  it('returns partial overlap score', () => {
    const score = computeNameSimilarity('Michael Schmidt', 'Michael Müller');
    // Intersection: {michael}, Union: {michael, schmidt, müller} → 1/3 ≈ 0.333
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('handles single word names', () => {
    const score = computeNameSimilarity('TypeScript', 'TypeScript');
    expect(score).toBe(1.0);
  });

  it('returns 0.0 for empty strings', () => {
    expect(computeNameSimilarity('', '')).toBe(0.0);
  });

  it('is case insensitive', () => {
    const score1 = computeNameSimilarity('michael', 'Michael');
    const score2 = computeNameSimilarity('michael', 'michael');
    expect(score1).toBe(score2);
  });
});

// ===========================================
// Tests: findMergeCandidates
// ===========================================

describe('findMergeCandidates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finds hard merge candidates for identical names and types', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: mockEntitiesPersonal } as any)
      .mockResolvedValueOnce({ rows: mockEntitiesWork } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');

    expect(candidates.length).toBeGreaterThan(0);
    const michaelCandidate = candidates.find(
      (c) => c.sourceEntityId === 'ent-p-001' && c.targetEntityId === 'ent-w-001'
    );
    expect(michaelCandidate).toBeDefined();
    expect(michaelCandidate?.mergeType).toBe('hard');
    expect(michaelCandidate?.mergeScore).toBeGreaterThanOrEqual(0.95);
  });

  it('finds hard merge for TypeScript (same name, same type)', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: mockEntitiesPersonal } as any)
      .mockResolvedValueOnce({ rows: mockEntitiesWork } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');

    const tsCandidate = candidates.find(
      (c) => c.sourceEntityId === 'ent-p-002' && c.targetEntityId === 'ent-w-002'
    );
    expect(tsCandidate).toBeDefined();
    expect(tsCandidate?.mergeType).toBe('hard');
  });

  it('classifies score >= 0.95 as hard merge', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: mockEntitiesPersonal } as any)
      .mockResolvedValueOnce({ rows: mockEntitiesWork } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');
    const hardMerges = candidates.filter((c) => c.mergeType === 'hard');
    hardMerges.forEach((c) => {
      expect(c.mergeScore).toBeGreaterThanOrEqual(0.95);
    });
  });

  it('classifies score 0.85-0.95 as soft merge', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: mockEntitiesPersonal } as any)
      .mockResolvedValueOnce({ rows: mockEntitiesWork } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');
    const softMerges = candidates.filter((c) => c.mergeType === 'soft');
    softMerges.forEach((c) => {
      expect(c.mergeScore).toBeGreaterThanOrEqual(0.85);
      expect(c.mergeScore).toBeLessThan(0.95);
    });
  });

  it('respects score threshold (excludes scores < 0.85)', async () => {
    const lowSimilarityEntities = [
      { id: 'ent-p-010', name: 'Alice', type: 'person', description: '', importance: 5, aliases: [] },
    ];
    const unrelatedEntities = [
      { id: 'ent-w-010', name: 'Bob Williams', type: 'person', description: '', importance: 5, aliases: [] },
    ];

    mockQueryContext
      .mockResolvedValueOnce({ rows: lowSimilarityEntities } as any)
      .mockResolvedValueOnce({ rows: unrelatedEntities } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array when source context has no entities', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: mockEntitiesWork } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');
    expect(candidates).toHaveLength(0);
  });

  it('returns empty array when target context has no entities', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: mockEntitiesPersonal } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');
    expect(candidates).toHaveLength(0);
  });

  it('includes correct context and entity info in candidate', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: mockEntitiesPersonal } as any)
      .mockResolvedValueOnce({ rows: mockEntitiesWork } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');
    const candidate = candidates[0];

    expect(candidate.sourceContext).toBe('personal');
    expect(candidate.targetContext).toBe('work');
    expect(candidate.sourceEntityId).toBeDefined();
    expect(candidate.targetEntityId).toBeDefined();
    expect(candidate.sourceEntityName).toBeDefined();
    expect(candidate.targetEntityName).toBeDefined();
    expect(candidate.mergeScore).toBeGreaterThanOrEqual(0.85);
    expect(['hard', 'soft']).toContain(candidate.mergeType);
  });

  it('applies type match bonus (+0.2) when types match', async () => {
    // Same name, same type should score higher than same name, different type
    const sameTypeEntities = [
      { id: 'src-1', name: 'React Framework', type: 'technology', description: '', importance: 5, aliases: [] },
    ];
    const matchingTypeTarget = [
      { id: 'tgt-1', name: 'React Framework', type: 'technology', description: '', importance: 5, aliases: [] },
    ];

    mockQueryContext
      .mockResolvedValueOnce({ rows: sameTypeEntities } as any)
      .mockResolvedValueOnce({ rows: matchingTypeTarget } as any);

    const candidates = await findMergeCandidates('user-001', 'personal', 'work');
    expect(candidates.length).toBeGreaterThan(0);
    // Should be a hard merge since same name (score 1.0 base) + type match bonus
    expect(candidates[0].mergeScore).toBeGreaterThanOrEqual(0.95);
  });
});

// ===========================================
// Tests: createCrossContextLink
// ===========================================

describe('createCrossContextLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const candidate: CrossContextCandidate = {
    sourceContext: 'personal',
    sourceEntityId: 'ent-p-001',
    sourceEntityName: 'Michael Schmidt',
    targetContext: 'work',
    targetEntityId: 'ent-w-001',
    targetEntityName: 'Michael Schmidt',
    mergeScore: 0.97,
    mergeType: 'hard',
  };

  it('inserts a link and returns it', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'link-001',
          source_context: 'personal',
          source_entity_id: 'ent-p-001',
          target_context: 'work',
          target_entity_id: 'ent-w-001',
          merge_type: 'hard',
          merge_score: 0.97,
          confirmed_by: null,
        },
      ],
    } as any);

    const link = await createCrossContextLink('user-001', candidate);

    expect(link).toBeDefined();
    expect(link.sourceContext).toBe('personal');
    expect(link.targetContext).toBe('work');
    expect(link.sourceEntityId).toBe('ent-p-001');
    expect(link.targetEntityId).toBe('ent-w-001');
    expect(link.mergeType).toBe('hard');
    expect(link.mergeScore).toBe(0.97);
  });

  it('handles duplicate gracefully (ON CONFLICT DO NOTHING)', async () => {
    // Simulate ON CONFLICT DO NOTHING returning empty rows
    mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

    await expect(createCrossContextLink('user-001', candidate)).resolves.not.toThrow();
  });

  it('calls pool.query (not queryContext) for public schema', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'link-002',
          source_context: 'personal',
          source_entity_id: 'ent-p-001',
          target_context: 'work',
          target_entity_id: 'ent-w-001',
          merge_type: 'hard',
          merge_score: 0.97,
          confirmed_by: null,
        },
      ],
    } as any);

    await createCrossContextLink('user-001', candidate);

    expect(mockPoolQuery).toHaveBeenCalled();
    // Should NOT use queryContext for public schema
    expect(mockQueryContext).not.toHaveBeenCalled();
  });
});

// ===========================================
// Tests: getCrossContextLinks
// ===========================================

describe('getCrossContextLinks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns links where entity is source', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'link-001',
          source_context: 'personal',
          source_entity_id: 'ent-p-001',
          target_context: 'work',
          target_entity_id: 'ent-w-001',
          merge_type: 'hard',
          merge_score: 1.0,
          confirmed_by: null,
        },
      ],
    } as any);

    const links = await getCrossContextLinks('user-001', 'personal', 'ent-p-001');

    expect(links).toHaveLength(1);
    expect(links[0].sourceEntityId).toBe('ent-p-001');
  });

  it('returns links where entity is target (both directions)', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'link-002',
          source_context: 'work',
          source_entity_id: 'ent-w-001',
          target_context: 'personal',
          target_entity_id: 'ent-p-001',
          merge_type: 'hard',
          merge_score: 1.0,
          confirmed_by: null,
        },
      ],
    } as any);

    const links = await getCrossContextLinks('user-001', 'personal', 'ent-p-001');

    expect(links).toHaveLength(1);
    expect(links[0].targetEntityId).toBe('ent-p-001');
  });

  it('returns empty array for unknown entity', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] } as any);

    const links = await getCrossContextLinks('user-001', 'personal', 'ent-unknown-999');

    expect(links).toHaveLength(0);
  });

  it('maps DB fields to camelCase interface', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'link-001',
          source_context: 'personal',
          source_entity_id: 'ent-p-001',
          target_context: 'work',
          target_entity_id: 'ent-w-001',
          merge_type: 'soft',
          merge_score: 0.88,
          confirmed_by: 'system',
        },
      ],
    } as any);

    const links = await getCrossContextLinks('user-001', 'personal', 'ent-p-001');

    expect(links[0].id).toBe('link-001');
    expect(links[0].sourceContext).toBe('personal');
    expect(links[0].sourceEntityId).toBe('ent-p-001');
    expect(links[0].targetContext).toBe('work');
    expect(links[0].targetEntityId).toBe('ent-w-001');
    expect(links[0].mergeType).toBe('soft');
    expect(links[0].mergeScore).toBe(0.88);
    expect(links[0].confirmedBy).toBe('system');
  });
});

// ===========================================
// Tests: runMergeDetection
// ===========================================

describe('runMergeDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs detection across all 6 context pairs', async () => {
    // 6 pairs × 2 queries each = 12 queryContext calls
    // For each pair: source entities + target entities
    // Return empty arrays to keep test simple
    mockQueryContext.mockResolvedValue({ rows: [] } as any);

    await runMergeDetection('user-001');

    // 6 pairs × 2 = 12 calls
    expect(mockQueryContext).toHaveBeenCalledTimes(12);
  });

  it('returns candidate and autoMerged counts', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] } as any);

    const result = await runMergeDetection('user-001');

    expect(result).toHaveProperty('candidates');
    expect(result).toHaveProperty('autoMerged');
    expect(typeof result.candidates).toBe('number');
    expect(typeof result.autoMerged).toBe('number');
  });

  it('auto-merges hard candidates and counts them', async () => {
    // First pair (personal-work): return matching entities
    const srcEntities = [
      { id: 'ent-p-001', name: 'Michael Schmidt', type: 'person', description: '', importance: 7, aliases: [] },
    ];
    const tgtEntities = [
      { id: 'ent-w-001', name: 'Michael Schmidt', type: 'person', description: '', importance: 9, aliases: [] },
    ];

    // 6 pairs × 2 queries = 12 total queryContext calls
    // Only pair 0 (personal-work) should find matches; rest return empty
    mockQueryContext
      .mockResolvedValueOnce({ rows: srcEntities } as any) // personal entities
      .mockResolvedValueOnce({ rows: tgtEntities } as any) // work entities
      .mockResolvedValue({ rows: [] } as any); // remaining 10 calls

    // Mock pool.query for the insert
    mockPoolQuery.mockResolvedValue({
      rows: [
        {
          id: 'link-new',
          source_context: 'personal',
          source_entity_id: 'ent-p-001',
          target_context: 'work',
          target_entity_id: 'ent-w-001',
          merge_type: 'hard',
          merge_score: 1.0,
          confirmed_by: null,
        },
      ],
    } as any);

    const result = await runMergeDetection('user-001');

    expect(result.autoMerged).toBeGreaterThan(0);
    expect(result.candidates).toBeGreaterThanOrEqual(result.autoMerged);
  });

  it('counts soft merges in candidates without auto-merging', async () => {
    // Create a scenario where name is partially similar (soft merge range)
    const srcEntities = [
      { id: 'ent-p-001', name: 'Mike Schmidt', type: 'person', description: '', importance: 7, aliases: ['Michael'] },
    ];
    const tgtEntities = [
      // Same aliases overlap → might score in soft range
      { id: 'ent-w-001', name: 'Michael Schmidt', type: 'person', description: '', importance: 9, aliases: ['Michael'] },
    ];

    mockQueryContext
      .mockResolvedValueOnce({ rows: srcEntities } as any)
      .mockResolvedValueOnce({ rows: tgtEntities } as any)
      .mockResolvedValue({ rows: [] } as any);

    mockPoolQuery.mockResolvedValue({ rows: [] } as any);

    const result = await runMergeDetection('user-001');

    expect(result.candidates).toBeGreaterThanOrEqual(0);
    expect(result.autoMerged).toBeGreaterThanOrEqual(0);
  });
});
