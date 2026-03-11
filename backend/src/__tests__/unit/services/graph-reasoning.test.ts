/**
 * Phase 48: Knowledge Graph Reasoning Tests
 */

import {
  inferTransitiveRelations,
  detectContradictions,
  detectCommunities,
  calculateCentrality,
  generateLearningPath,
  createManualRelation,
  updateRelationStrength,
  deleteRelation,
} from '../../../services/knowledge-graph/graph-reasoning';
import { queryContext } from '../../../utils/database-context';

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

var mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('Knowledge Graph Reasoning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('inferTransitiveRelations', () => {
    it('should find transitive relationships and cache them', async () => {
      // Main query finds 2-hop paths
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            start_id: 'a',
            bridge_id: 'b',
            end_id: 'c',
            type1: 'builds_on',
            type2: 'enables',
            strength1: '0.8',
            strength2: '0.7',
            inferred_strength: '0.56',
          },
        ],
      } as never);

      // Cache insertion
      mockQueryContext.mockResolvedValue({ rows: [] } as never);

      const result = await inferTransitiveRelations('personal');

      expect(result).toHaveLength(1);
      expect(result[0].sourceId).toBe('a');
      expect(result[0].targetId).toBe('c');
      expect(result[0].inferenceType).toBe('transitive');
      expect(result[0].pathIds).toEqual(['a', 'b', 'c']);
      expect(result[0].confidence).toBe(0.56);
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await inferTransitiveRelations('personal');
      expect(result).toEqual([]);
    });
  });

  describe('detectContradictions', () => {
    it('should find contradiction chains', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            source_id: 'x',
            bridge_id: 'y',
            target_id: 'z',
            support_strength: '0.9',
            contradict_strength: '0.8',
          },
        ],
      } as never);

      const result = await detectContradictions('personal');

      expect(result).toHaveLength(1);
      expect(result[0].inferenceType).toBe('contradiction');
      expect(result[0].confidence).toBe(0.8); // min of 0.9, 0.8
    });

    it('should return empty on no contradictions', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
      const result = await detectContradictions('personal');
      expect(result).toEqual([]);
    });
  });

  describe('detectCommunities', () => {
    it('should detect graph communities', async () => {
      // Connected components query
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { component_id: 'comp-1', member_ids: ['a', 'b', 'c'], member_count: '3' },
        ],
      } as never);

      // Coherence calculation
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ avg_strength: '0.75' }],
      } as never);

      // Store community
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await detectCommunities('personal');

      expect(result).toHaveLength(1);
      expect(result[0].memberCount).toBe(3);
      expect(result[0].coherenceScore).toBe(0.75);
    });

    it('should return empty on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const result = await detectCommunities('personal');
      expect(result).toEqual([]);
    });
  });

  describe('calculateCentrality', () => {
    it('should calculate centrality metrics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            idea_id: 'hub-1',
            title: 'Central Idea',
            degree_centrality: '1.0',
            betweenness_centrality: '0.8',
            is_hub: true,
            is_bridge: true,
          },
        ],
      } as never);

      const result = await calculateCentrality('personal');

      expect(result).toHaveLength(1);
      expect(result[0].ideaId).toBe('hub-1');
      expect(result[0].degreeCentrality).toBe(1.0);
      expect(result[0].isHub).toBe(true);
      expect(result[0].isBridge).toBe(true);
    });

    it('should return empty on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const result = await calculateCentrality('personal');
      expect(result).toEqual([]);
    });
  });

  describe('generateLearningPath', () => {
    it('should generate a learning path from start idea', async () => {
      // Get start idea
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'start', title: 'Start Idea', summary: 'Beginning' }],
      } as never);

      // Get next step
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          next_id: 'step-2',
          title: 'Second Step',
          summary: 'Next concept',
          relation_type: 'builds_on',
          strength: '0.85',
        }],
      } as never);

      // No more steps
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      const result = await generateLearningPath('personal', 'start', { maxSteps: 5 });

      expect(result).toHaveLength(2);
      expect(result[0].order).toBe(1);
      expect(result[0].connectionType).toBe('start');
      expect(result[1].order).toBe(2);
      expect(result[1].connectionType).toBe('builds_on');
    });

    it('should return empty if start idea not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);
      const result = await generateLearningPath('personal', 'nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('createManualRelation', () => {
    it('should create a manual relation', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'rel-1' }],
      } as never);

      const id = await createManualRelation('personal', 'a', 'b', 'supports', 0.9);
      expect(id).toBe('rel-1');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO idea_relations'),
        expect.arrayContaining(['a', 'b', 'supports'])
      );
    });

    it('should clamp strength to 0-1 range', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'rel-1' }] } as never);

      await createManualRelation('personal', 'a', 'b', 'supports', 1.5);
      // Strength should be clamped to 1
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining([1])
      );
    });
  });

  describe('updateRelationStrength', () => {
    it('should update strength', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await updateRelationStrength('personal', 'a', 'b', 0.6);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('UPDATE idea_relations'),
        ['a', 'b', 0.6, 'personal']
      );
    });
  });

  describe('deleteRelation', () => {
    it('should delete a relation', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as never);

      await deleteRelation('personal', 'a', 'b');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('DELETE FROM idea_relations'),
        ['a', 'b', 'personal']
      );
    });
  });
});
