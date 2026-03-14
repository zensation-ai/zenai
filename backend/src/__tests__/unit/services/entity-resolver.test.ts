/**
 * Phase 59: Entity Resolver Tests
 */

import { queryContext } from '../../../utils/database-context';
import { EntityResolver } from '../../../services/memory/entity-resolver';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

// Mock GraphBuilder
jest.mock('../../../services/knowledge-graph/graph-builder', () => ({
  GraphBuilder: jest.fn().mockImplementation(() => ({
    extractFromText: jest.fn().mockResolvedValue({
      entities: [
        { id: 'ent-001', name: 'TypeScript', type: 'technology', description: 'Programming language', importance: 8 },
        { id: 'ent-002', name: 'React', type: 'technology', description: 'UI framework', importance: 7 },
      ],
      relations: [],
      entityCount: 2,
      relationCount: 0,
    }),
  })),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Tests
// ===========================================

describe('EntityResolver', () => {
  let resolver: EntityResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = new EntityResolver();
  });

  describe('resolveFromFact', () => {
    it('should extract and link entities from fact content', async () => {
      // Find fact by content
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'fact-001' }],
        rowCount: 1,
      } as any);
      // Link entity 1 (knowledge_entities lookup - not needed since id is provided)
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'link-001', fact_id: 'fact-001', entity_id: 'ent-001', link_type: 'mentions', confidence: 0.8, created_at: new Date() }],
        rowCount: 1,
      } as any);
      // Link entity 2
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'link-002', fact_id: 'fact-001', entity_id: 'ent-002', link_type: 'mentions', confidence: 0.8, created_at: new Date() }],
        rowCount: 1,
      } as any);

      const links = await resolver.resolveFromFact('personal', 'TypeScript and React are used in the project');

      expect(links).toHaveLength(2);
      expect(links[0].factId).toBe('fact-001');
      expect(links[0].entityId).toBe('ent-001');
    });

    it('should return empty array for short content', async () => {
      const links = await resolver.resolveFromFact('personal', 'Hi');

      expect(links).toEqual([]);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should return empty array for empty content', async () => {
      const links = await resolver.resolveFromFact('personal', '');

      expect(links).toEqual([]);
    });

    it('should handle fact not found in database', async () => {
      // learned_facts lookup returns nothing
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // personalization_facts lookup returns nothing
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const links = await resolver.resolveFromFact('personal', 'Some fact content that is long enough');

      expect(links).toEqual([]);
    });

    it('should try personalization_facts as fallback', async () => {
      // learned_facts lookup returns nothing
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // personalization_facts lookup returns fact
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'pf-001' }], rowCount: 1 } as any);
      // Link entity 1
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'link-001', fact_id: 'pf-001', entity_id: 'ent-001', link_type: 'mentions', confidence: 0.8, created_at: new Date() }],
        rowCount: 1,
      } as any);
      // Link entity 2
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'link-002', fact_id: 'pf-001', entity_id: 'ent-002', link_type: 'mentions', confidence: 0.8, created_at: new Date() }],
        rowCount: 1,
      } as any);

      const links = await resolver.resolveFromFact('personal', 'TypeScript and React in the project are important');

      expect(links).toHaveLength(2);
    });

    it('should handle GraphBuilder extraction failure', async () => {
      const { GraphBuilder } = require('../../../services/knowledge-graph/graph-builder');
      GraphBuilder.mockImplementationOnce(() => ({
        extractFromText: jest.fn().mockRejectedValue(new Error('Claude API error')),
      }));

      const newResolver = new EntityResolver();
      const links = await newResolver.resolveFromFact('personal', 'This is a test fact with enough content');

      expect(links).toEqual([]);
    });
  });

  describe('linkFactToEntities', () => {
    it('should create memory_entity_links records', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'link-001', fact_id: 'fact-001', entity_id: 'ent-001', link_type: 'mentions', confidence: 0.8, created_at: new Date() }],
        rowCount: 1,
      } as any);

      const links = await resolver.linkFactToEntities('personal', 'fact-001', [
        { entityId: 'ent-001', name: 'TypeScript', type: 'technology' },
      ]);

      expect(links).toHaveLength(1);
      expect(links[0].factId).toBe('fact-001');
      expect(links[0].entityId).toBe('ent-001');
    });

    it('should resolve entity ID by name when not provided', async () => {
      // Lookup entity by name
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'ent-resolved' }], rowCount: 1 } as any);
      // Create link
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'link-001', fact_id: 'fact-001', entity_id: 'ent-resolved', link_type: 'mentions', confidence: 0.8, created_at: new Date() }],
        rowCount: 1,
      } as any);

      const links = await resolver.linkFactToEntities('personal', 'fact-001', [
        { entityId: '', name: 'TypeScript', type: 'technology' },
      ]);

      expect(links).toHaveLength(1);
      expect(links[0].entityId).toBe('ent-resolved');
    });

    it('should skip entities that cannot be resolved', async () => {
      // Lookup returns no entity
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const links = await resolver.linkFactToEntities('personal', 'fact-001', [
        { entityId: '', name: 'UnknownEntity', type: 'concept' },
      ]);

      expect(links).toEqual([]);
    });

    it('should handle insert conflict (ON CONFLICT)', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'link-001', fact_id: 'fact-001', entity_id: 'ent-001', link_type: 'mentions', confidence: 0.9, created_at: new Date() }],
        rowCount: 1,
      } as any);

      const links = await resolver.linkFactToEntities('personal', 'fact-001', [
        { entityId: 'ent-001', name: 'TypeScript', type: 'technology' },
      ]);

      expect(links).toHaveLength(1);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });
  });

  describe('getFactEntities', () => {
    it('should return entities linked to a fact', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { entity_id: 'ent-001', entity_name: 'TypeScript', entity_type: 'technology', link_type: 'mentions', confidence: 0.9 },
          { entity_id: 'ent-002', entity_name: 'React', entity_type: 'technology', link_type: 'mentions', confidence: 0.8 },
        ],
        rowCount: 2,
      } as any);

      const entities = await resolver.getFactEntities('personal', 'fact-001');

      expect(entities).toHaveLength(2);
      expect(entities[0].entityName).toBe('TypeScript');
      expect(entities[0].entityType).toBe('technology');
    });

    it('should return empty array when no entities linked', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const entities = await resolver.getFactEntities('personal', 'fact-no-entities');

      expect(entities).toEqual([]);
    });

    it('should query with correct JOIN', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await resolver.getFactEntities('work', 'fact-001');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('JOIN knowledge_entities'),
        ['fact-001']
      );
    });
  });

  describe('getEntityFacts', () => {
    it('should return facts linked to an entity', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { fact_id: 'fact-001', content: 'TypeScript is preferred', fact_type: 'preference', link_type: 'mentions', confidence: 0.9 },
        ],
        rowCount: 1,
      } as any);

      const facts = await resolver.getEntityFacts('personal', 'ent-001');

      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe('TypeScript is preferred');
    });

    it('should return empty array when no facts linked', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const facts = await resolver.getEntityFacts('personal', 'ent-no-facts');

      expect(facts).toEqual([]);
    });

    it('should filter out null content rows', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { fact_id: 'fact-001', content: 'Valid fact', fact_type: 'knowledge', link_type: 'mentions', confidence: 0.9 },
          { fact_id: 'fact-002', content: null, fact_type: null, link_type: 'mentions', confidence: 0.8 },
        ],
        rowCount: 2,
      } as any);

      const facts = await resolver.getEntityFacts('personal', 'ent-001');

      expect(facts).toHaveLength(1);
      expect(facts[0].factId).toBe('fact-001');
    });

    it('should use LEFT JOINs for both fact tables', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await resolver.getEntityFacts('learning', 'ent-001');

      const sql = mockQueryContext.mock.calls[0][1];
      expect(sql).toContain('LEFT JOIN learned_facts');
      expect(sql).toContain('LEFT JOIN personalization_facts');
    });
  });
});
