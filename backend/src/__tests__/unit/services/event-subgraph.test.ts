/**
 * Event Subgraph (Layer 1) Tests
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
  recordEvent,
  queryEventsByTimeRange,
  getEntityActivityScore,
  getActivityHeatmap,
  pruneOldEvents,
} from '../../../services/knowledge-graph/event-subgraph';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('Event Subgraph (Layer 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // recordEvent
  // ===========================================

  describe('recordEvent', () => {
    it('should insert event and return id', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'evt-123' }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const id = await recordEvent('operations', 'entity_creation', 'system:graph-builder', {
        targetEntityId: 'ent-1',
        payload: { name: 'TypeScript', type: 'technology' },
      });

      expect(id).toBe('evt-123');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('INSERT INTO graph_events'),
        expect.arrayContaining(['entity_creation', 'system:graph-builder'])
      );
    });

    it('should return empty string on failure', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const id = await recordEvent('operations', 'tool_invocation', 'user');

      expect(id).toBe('');
    });
  });

  // ===========================================
  // queryEventsByTimeRange
  // ===========================================

  describe('queryEventsByTimeRange', () => {
    it('should filter by date range', async () => {
      const now = new Date();
      const weekAgo = new Date(Date.now() - 7 * 86400000);

      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            id: 'evt-1',
            event_type: 'entity_creation',
            actor: 'system:graph-builder',
            target_entity_id: 'ent-1',
            related_entity_ids: [],
            payload: {},
            context: 'operations',
            created_at: now.toISOString(),
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const events = await queryEventsByTimeRange('operations', weekAgo, now);

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('entity_creation');
      expect(events[0].actor).toBe('system:graph-builder');
    });

    it('should filter by event type', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const events = await queryEventsByTimeRange(
        'operations',
        new Date(Date.now() - 86400000),
        new Date(),
        { eventType: 'search_hit' }
      );

      expect(events).toHaveLength(0);
      // Verify the event type filter was included in the query
      const callArgs = mockQueryContext.mock.calls[0];
      expect(callArgs[1]).toContain('event_type');
      expect(callArgs[2]).toContain('search_hit');
    });

    it('should filter by entity id', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await queryEventsByTimeRange(
        'operations',
        new Date(Date.now() - 86400000),
        new Date(),
        { entityId: 'ent-42' }
      );

      const callArgs = mockQueryContext.mock.calls[0];
      expect(callArgs[1]).toContain('target_entity_id');
      expect(callArgs[2]).toContain('ent-42');
    });
  });

  // ===========================================
  // getEntityActivityScore
  // ===========================================

  describe('getEntityActivityScore', () => {
    it('should return correct totals', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { event_type: 'entity_creation', count: '3', last_activity: new Date().toISOString() },
          { event_type: 'search_hit', count: '5', last_activity: new Date().toISOString() },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getEntityActivityScore('operations', 'ent-1', 7);

      expect(result.totalEvents).toBe(8);
      expect(result.eventsByType['entity_creation']).toBe(3);
      expect(result.eventsByType['search_hit']).toBe(5);
      expect(result.lastActivity).not.toBeNull();
    });

    it('should return recency score ~1.0 for activity today', async () => {
      const now = new Date();
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { event_type: 'chat_reference', count: '2', last_activity: now.toISOString() },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getEntityActivityScore('operations', 'ent-1', 7);

      // Recency score should be very close to 1.0 for today
      expect(result.recencyScore).toBeGreaterThan(0.9);
    });

    it('should return decayed recency score for older activity', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 86400000);
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { event_type: 'entity_creation', count: '1', last_activity: fourDaysAgo.toISOString() },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getEntityActivityScore('operations', 'ent-1', 7);

      // 4 days ago with 7-day window: exp(-4/7) ≈ 0.565
      expect(result.recencyScore).toBeLessThan(0.7);
      expect(result.recencyScore).toBeGreaterThan(0.4);
    });

    it('should return zero totals when no events exist', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getEntityActivityScore('operations', 'ent-999', 7);

      expect(result.totalEvents).toBe(0);
      expect(result.recencyScore).toBeCloseTo(Math.exp(-1), 1);
      expect(result.lastActivity).toBeNull();
    });
  });

  // ===========================================
  // getActivityHeatmap
  // ===========================================

  describe('getActivityHeatmap', () => {
    it('should return daily counts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { date: '2026-03-25', count: '5' },
          { date: '2026-03-26', count: '12' },
          { date: '2026-03-27', count: '3' },
        ],
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const heatmap = await getActivityHeatmap('operations', 30);

      expect(heatmap).toHaveLength(3);
      expect(heatmap[0]).toEqual({ date: '2026-03-25', count: 5 });
      expect(heatmap[1]).toEqual({ date: '2026-03-26', count: 12 });
      expect(heatmap[2]).toEqual({ date: '2026-03-27', count: 3 });
    });
  });

  // ===========================================
  // pruneOldEvents
  // ===========================================

  describe('pruneOldEvents', () => {
    it('should delete old events and return count', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 42,
        command: 'DELETE',
        oid: 0,
        fields: [],
      });

      const deleted = await pruneOldEvents('operations', 90);

      expect(deleted).toBe(42);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('DELETE FROM graph_events'),
        expect.any(Array)
      );
    });

    it('should preserve recent events (return 0 when nothing to prune)', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'DELETE',
        oid: 0,
        fields: [],
      });

      const deleted = await pruneOldEvents('operations', 90);

      expect(deleted).toBe(0);
    });
  });
});
