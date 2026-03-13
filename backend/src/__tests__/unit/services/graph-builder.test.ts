/**
 * Phase 58: Graph Builder Tests
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  })),
}));

import { queryContext } from '../../../utils/database-context';
import { GraphBuilder, Entity, Relation } from '../../../services/knowledge-graph/graph-builder';
import Anthropic from '@anthropic-ai/sdk';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('GraphBuilder', () => {
  let builder: GraphBuilder;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    builder = new GraphBuilder();
    // Get mock create function
    const instance = (Anthropic as unknown as jest.Mock).mock.results[0]?.value;
    if (instance) {
      mockCreate = instance.messages.create;
    } else {
      // Re-instantiate to get the mock
      const newInstance = new (Anthropic as unknown as jest.Mock)();
      mockCreate = newInstance.messages.create;
    }
  });

  // ===========================================
  // extractEntities
  // ===========================================

  describe('extractEntities (via extractFromText)', () => {
    it('should extract entities from text', async () => {
      const entities: Entity[] = [
        { name: 'TypeScript', type: 'technology', description: 'Programming language', importance: 8 },
        { name: 'React', type: 'technology', description: 'UI library', importance: 7 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(entities) }],
      });

      // For relations extraction
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      // For entity resolution - no existing entities
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('TypeScript with React is great', 'source-1', 'personal');

      expect(result.entities.length).toBe(2);
      expect(result.entities[0].name).toBe('TypeScript');
    });

    it('should handle malformed JSON from Claude', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Here are the entities: [{invalid json' }],
      });

      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('some text', 'source-1', 'personal');
      expect(result.entities).toEqual([]);
    });

    it('should handle empty text', async () => {
      const result = await builder.extractFromText('', 'source-1', 'personal');
      expect(result.entities).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it('should extract JSON embedded in text', async () => {
      const entities = [
        { name: 'Python', type: 'technology', description: 'Language', importance: 8 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: `Here are the entities:\n${JSON.stringify(entities)}\nEnd.` }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('Python programming', 'source-1', 'personal');
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].name).toBe('Python');
    });

    it('should filter invalid entity types', async () => {
      const entities = [
        { name: 'Valid', type: 'concept', description: 'Yes', importance: 5 },
        { name: 'Invalid', type: 'foo_bar', description: 'No', importance: 5 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(entities) }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('Some text', 'source-1', 'personal');
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].name).toBe('Valid');
    });

    it('should handle Claude API errors gracefully', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API rate limited'));
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('Some text', 'source-1', 'personal');
      expect(result.entities).toEqual([]);
    });

    it('should clamp importance values to 1-10', async () => {
      const entities = [
        { name: 'High', type: 'concept', description: 'Too high', importance: 15 },
        { name: 'Low', type: 'concept', description: 'Too low', importance: -5 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(entities) }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('Some text', 'source-1', 'personal');
      expect(result.entities[0].importance).toBe(10);
      expect(result.entities[1].importance).toBe(1);
    });
  });

  // ===========================================
  // extractRelations
  // ===========================================

  describe('extractRelations (via extractFromText)', () => {
    it('should extract relations between entities', async () => {
      const entities = [
        { name: 'React', type: 'technology', description: 'UI library', importance: 8 },
        { name: 'JavaScript', type: 'technology', description: 'Language', importance: 9 },
      ];

      const relations: Relation[] = [
        { source: 'React', target: 'JavaScript', type: 'requires', description: 'React is built on JS', strength: 0.9 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(entities) }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(relations) }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('React requires JavaScript', 'source-1', 'personal');
      expect(result.relations.length).toBe(1);
      expect(result.relations[0].type).toBe('requires');
    });

    it('should filter relations with invalid entity references', async () => {
      const entities = [
        { name: 'React', type: 'technology', description: 'Library', importance: 8 },
      ];

      const relations = [
        { source: 'React', target: 'NonExistent', type: 'requires', description: 'Invalid', strength: 0.5 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(entities) }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(relations) }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('React code', 'source-1', 'personal');
      // Relation filtered because NonExistent is not in entities
      expect(result.relations.length).toBe(0);
    });

    it('should filter self-referencing relations', async () => {
      const entities = [
        { name: 'React', type: 'technology', description: 'Library', importance: 8 },
        { name: 'Vue', type: 'technology', description: 'Framework', importance: 7 },
      ];

      const relations = [
        { source: 'React', target: 'React', type: 'similar_to', description: 'Self', strength: 1.0 },
        { source: 'React', target: 'Vue', type: 'similar_to', description: 'Both frameworks', strength: 0.8 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(entities) }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(relations) }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('React vs Vue', 'source-1', 'personal');
      expect(result.relations.length).toBe(1);
      expect(result.relations[0].source).toBe('React');
      expect(result.relations[0].target).toBe('Vue');
    });
  });

  // ===========================================
  // resolveEntities
  // ===========================================

  describe('resolveEntities', () => {
    it('should merge with existing entity when similarity > 0.92', async () => {
      const entities: Entity[] = [
        { name: 'TypeScript', type: 'technology', description: 'Language', importance: 8 },
      ];

      // findSimilarEntity returns high similarity
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'existing-id', name: 'TypeScript Language', similarity: '0.95' }],
      } as any);

      const resolved = await builder.resolveEntities(entities, 'personal');
      expect(resolved[0].id).toBe('existing-id');
      expect(resolved[0].name).toBe('TypeScript Language'); // Uses canonical name
    });

    it('should keep as new entity when similarity < 0.92', async () => {
      const entities: Entity[] = [
        { name: 'NewConcept', type: 'concept', description: 'Brand new', importance: 5 },
      ];

      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'some-id', name: 'OldConcept', similarity: '0.5' }],
      } as any);

      const resolved = await builder.resolveEntities(entities, 'personal');
      expect(resolved[0].id).toBeUndefined();
      expect(resolved[0].name).toBe('NewConcept');
    });

    it('should handle no existing entities', async () => {
      const entities: Entity[] = [
        { name: 'Brand New', type: 'concept', description: 'Never seen', importance: 5 },
      ];

      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const resolved = await builder.resolveEntities(entities, 'personal');
      expect(resolved[0].id).toBeUndefined();
    });
  });

  // ===========================================
  // upsertToGraph
  // ===========================================

  describe('upsertToGraph', () => {
    it('should insert new entities and relations', async () => {
      const entities: Entity[] = [
        { name: 'A', type: 'concept', description: 'Entity A', importance: 5 },
        { name: 'B', type: 'concept', description: 'Entity B', importance: 5 },
      ];

      const relations: Relation[] = [
        { source: 'A', target: 'B', type: 'supports', description: 'A supports B', strength: 0.8 },
      ];

      // Entity A insert
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'id-a' }] } as any);
      // Entity B insert
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'id-b' }] } as any);
      // Relation insert
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await builder.upsertToGraph(entities, relations, 'source-1', 'personal');
      expect(result.entitiesCreated).toBe(2);
      expect(result.relationsCreated).toBe(1);
    });

    it('should update existing entities', async () => {
      const entities: Entity[] = [
        { id: 'existing-1', name: 'Existing', type: 'concept', description: 'Already exists', importance: 5 },
      ];

      // Update query
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await builder.upsertToGraph(entities, [], 'source-1', 'personal');
      expect(result.entitiesUpdated).toBe(1);
      expect(result.entitiesCreated).toBe(0);
    });

    it('should skip relations with missing entities', async () => {
      const entities: Entity[] = [
        { name: 'A', type: 'concept', description: 'Only A', importance: 5 },
      ];

      const relations: Relation[] = [
        { source: 'A', target: 'Missing', type: 'supports', description: 'Invalid', strength: 0.5 },
      ];

      // Entity A insert
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'id-a' }] } as any);

      const result = await builder.upsertToGraph(entities, relations, 'source-1', 'personal');
      expect(result.relationsCreated).toBe(0);
    });

    it('should handle entity insert failure gracefully', async () => {
      const entities: Entity[] = [
        { name: 'Failing', type: 'concept', description: 'Will fail', importance: 5 },
      ];

      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await builder.upsertToGraph(entities, [], 'source-1', 'personal');
      expect(result.entitiesCreated).toBe(0);
    });
  });

  // ===========================================
  // Full Pipeline
  // ===========================================

  describe('extractFromText (full pipeline)', () => {
    it('should run the complete extraction pipeline', async () => {
      const entities = [
        { name: 'Docker', type: 'technology', description: 'Containerization', importance: 9 },
        { name: 'Kubernetes', type: 'technology', description: 'Orchestration', importance: 9 },
      ];

      const relations = [
        { source: 'Docker', target: 'Kubernetes', type: 'requires', description: 'K8s uses Docker', strength: 0.85 },
      ];

      // Entity extraction
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(entities) }],
      });

      // Relation extraction
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(relations) }],
      });

      // Entity resolution (no matches)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // Upsert entities
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'docker-id' }] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'k8s-id' }] } as any);

      // Upsert relation
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await builder.extractFromText(
        'Docker and Kubernetes are used for container orchestration',
        'source-1',
        'personal'
      );

      expect(result.entityCount).toBe(2);
      expect(result.relationCount).toBe(1);
    });

    it('should handle whitespace-only text', async () => {
      const result = await builder.extractFromText('   \n\t  ', 'source-1', 'personal');
      expect(result.entityCount).toBe(0);
    });

    it('should truncate very long text', async () => {
      const longText = 'a'.repeat(10000);

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });

      const result = await builder.extractFromText(longText, 'source-1', 'personal');
      expect(result.entities).toEqual([]);
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('edge cases', () => {
    it('should handle non-text content response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
      });

      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('Some text', 'source-1', 'personal');
      expect(result.entities).toEqual([]);
    });

    it('should handle entities with missing required fields', async () => {
      const badEntities = [
        { type: 'concept', description: 'No name' }, // missing name
        { name: '', type: 'concept', description: 'Empty name' }, // empty name
        { name: 'Good', type: 'concept', description: 'Valid', importance: 5 },
      ];

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(badEntities) }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '[]' }],
      });
      mockQueryContext.mockResolvedValue({ rows: [] } as any);

      const result = await builder.extractFromText('Some text', 'source-1', 'personal');
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].name).toBe('Good');
    });
  });
});
