/**
 * Graph Layers Coordinator Tests
 */

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

jest.mock('../../../services/knowledge-graph/event-subgraph', () => ({
  getEntityActivityScore: jest.fn(),
  getActivityHeatmap: jest.fn(),
}));

import {
  queryAcrossLayers,
  getGraphOverview,
} from '../../../services/knowledge-graph/graph-layers';
import { getEntityActivityScore, getActivityHeatmap } from '../../../services/knowledge-graph/event-subgraph';

const mockGetEntityActivityScore = getEntityActivityScore as jest.MockedFunction<typeof getEntityActivityScore>;
const mockGetActivityHeatmap = getActivityHeatmap as jest.MockedFunction<typeof getActivityHeatmap>;

describe('Graph Layers Coordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // queryAcrossLayers
  // ===========================================

  describe('queryAcrossLayers', () => {
    it('should return combined scores for entities', async () => {
      mockGetEntityActivityScore
        .mockResolvedValueOnce({
          totalEvents: 10,
          eventsByType: { entity_creation: 5, search_hit: 5 },
          recencyScore: 0.9,
          lastActivity: new Date(),
        })
        .mockResolvedValueOnce({
          totalEvents: 2,
          eventsByType: { entity_creation: 2 },
          recencyScore: 0.3,
          lastActivity: new Date(Date.now() - 5 * 86400000),
        });

      const results = await queryAcrossLayers('operations', ['ent-1', 'ent-2']);

      expect(results).toHaveLength(2);
      expect(results[0].entityId).toBe('ent-1');
      expect(results[0].eventScore).toBeGreaterThan(results[1].eventScore);
      // Event score combines frequency (log-normalized) and recency
      expect(results[0].eventScore).toBeGreaterThan(0);
      expect(results[1].eventScore).toBeGreaterThan(0);
    });

    it('should return empty array for empty entityIds', async () => {
      const results = await queryAcrossLayers('operations', []);

      expect(results).toHaveLength(0);
      expect(mockGetEntityActivityScore).not.toHaveBeenCalled();
    });

    it('should handle activity score fetch failures gracefully', async () => {
      mockGetEntityActivityScore.mockRejectedValueOnce(new Error('DB error'));

      const results = await queryAcrossLayers('operations', ['ent-1']);

      expect(results).toHaveLength(1);
      expect(results[0].eventScore).toBe(0);
    });
  });

  // ===========================================
  // getGraphOverview
  // ===========================================

  describe('getGraphOverview', () => {
    it('should return event heatmap and total', async () => {
      mockGetActivityHeatmap.mockResolvedValueOnce([
        { date: '2026-03-25', count: 5 },
        { date: '2026-03-26', count: 12 },
      ]);

      const overview = await getGraphOverview('operations');

      expect(overview.eventLayer.totalEvents).toBe(17);
      expect(overview.eventLayer.heatmap).toHaveLength(2);
      expect(overview.eventLayer.heatmap[0].date).toBe('2026-03-25');
    });

    it('should return zero total when no events exist', async () => {
      mockGetActivityHeatmap.mockResolvedValueOnce([]);

      const overview = await getGraphOverview('operations');

      expect(overview.eventLayer.totalEvents).toBe(0);
      expect(overview.eventLayer.heatmap).toHaveLength(0);
    });
  });
});
