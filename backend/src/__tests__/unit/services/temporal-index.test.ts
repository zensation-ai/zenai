/**
 * Temporal Index Tests
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

import { queryContext } from '../../../utils/database-context';
import {
  getTemporalEntityRanking,
  getEntityTimeline,
} from '../../../services/knowledge-graph/temporal-index';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('Temporal Index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // getTemporalEntityRanking
  // ===========================================

  describe('getTemporalEntityRanking', () => {
    it('should return entities sorted by recency', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            entity_id: 'ent-1',
            entity_name: 'TypeScript',
            total_events: '25',
            recent_events: '10',
            older_events: '15',
          },
          {
            entity_id: 'ent-2',
            entity_name: 'React',
            total_events: '20',
            recent_events: '5',
            older_events: '15',
          },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const ranking = await getTemporalEntityRanking('operations', 20);

      expect(ranking).toHaveLength(2);
      expect(ranking[0].entityId).toBe('ent-1');
      expect(ranking[0].entityName).toBe('TypeScript');
      expect(ranking[0].totalEvents).toBe(25);
      expect(ranking[0].recentEvents).toBe(10);
    });

    it('should detect rising trend', async () => {
      // Recent = 10, Older = 5 (over ~23 days = ~1.52/week). Recent > 1.52*1.5 = 2.28 → rising
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            entity_id: 'ent-1',
            entity_name: 'HotTopic',
            total_events: '15',
            recent_events: '10',
            older_events: '5',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const ranking = await getTemporalEntityRanking('operations');

      expect(ranking[0].trend).toBe('rising');
    });

    it('should detect declining trend', async () => {
      // Recent = 1, Older = 20 (over ~23 days = ~6.08/week). Recent < 6.08*0.5 = 3.04 → declining
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            entity_id: 'ent-1',
            entity_name: 'OldTopic',
            total_events: '21',
            recent_events: '1',
            older_events: '20',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const ranking = await getTemporalEntityRanking('operations');

      expect(ranking[0].trend).toBe('declining');
    });

    it('should return stable trend when activity is consistent', async () => {
      // Recent = 5, Older = 15 (over ~23 days = ~4.56/week). 5 is between 2.28 and 6.84 → stable
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            entity_id: 'ent-1',
            entity_name: 'StableTopic',
            total_events: '20',
            recent_events: '5',
            older_events: '15',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const ranking = await getTemporalEntityRanking('operations');

      expect(ranking[0].trend).toBe('stable');
    });

    it('should have log-normalized activityScore', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            entity_id: 'ent-1',
            entity_name: 'Entity',
            total_events: '50',
            recent_events: '5',
            older_events: '10',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const ranking = await getTemporalEntityRanking('operations');

      // log(51)/log(100) ≈ 0.854
      expect(ranking[0].activityScore).toBeGreaterThan(0.8);
      expect(ranking[0].activityScore).toBeLessThanOrEqual(1);
    });
  });

  // ===========================================
  // getEntityTimeline
  // ===========================================

  describe('getEntityTimeline', () => {
    it('should return events in reverse chronological order', async () => {
      const now = new Date();
      const earlier = new Date(Date.now() - 3600000);

      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            event_type: 'search_hit',
            actor: 'system:rag',
            payload: { query: 'test' },
            created_at: now.toISOString(),
          },
          {
            event_type: 'entity_creation',
            actor: 'system:graph-builder',
            payload: { name: 'TypeScript' },
            created_at: earlier.toISOString(),
          },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const timeline = await getEntityTimeline('operations', 'ent-1', 50);

      expect(timeline).toHaveLength(2);
      expect(timeline[0].eventType).toBe('search_hit');
      expect(timeline[1].eventType).toBe('entity_creation');
      expect(new Date(timeline[0].createdAt).getTime()).toBeGreaterThan(
        new Date(timeline[1].createdAt).getTime()
      );
    });

    it('should return empty array when no events exist', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const timeline = await getEntityTimeline('operations', 'ent-999');

      expect(timeline).toHaveLength(0);
    });
  });
});
