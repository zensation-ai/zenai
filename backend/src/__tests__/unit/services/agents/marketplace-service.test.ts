const mockQueryPublic = jest.fn();
const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

import { MarketplaceService, marketplaceService } from '../../../../services/agents/marketplace-service';

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    mockQueryContext.mockReset();
    service = new MarketplaceService();
  });

  describe('listCommunityBlueprints', () => {
    it('returns community blueprints', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'bp1', name: 'Agent 1', source: 'community', avg_rating: 4.5, rating_count: 10, usage_count: 100, created_at: '2026-01-01' }],
      });
      const result = await service.listCommunityBlueprints();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('bp1');
      expect(result[0].rating).toBe(4.5);
    });

    it('applies category filter', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.listCommunityBlueprints({ category: 'productivity' });
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('category');
    });

    it('applies search filter', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.listCommunityBlueprints({ search: 'email' });
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('ILIKE');
    });

    it('sorts by rating', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.listCommunityBlueprints({ sort: 'rating' });
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('rating DESC');
    });

    it('sorts by newest', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.listCommunityBlueprints({ sort: 'newest' });
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain('created_at DESC');
    });

    it('applies limit and offset', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.listCommunityBlueprints({ limit: 10, offset: 20 });
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params).toContain(10);
      expect(params).toContain(20);
    });
  });

  describe('installBlueprint', () => {
    it('copies blueprint with user_created source', async () => {
      // Get original
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'original', name: 'Original', description: 'Desc', icon: '🤖',
          category: 'custom', tags: ['a'], type: 'autonomous', triggers: '[]',
          max_actions_per_day: 10, token_budget_daily: 50000, approval_required: false,
          tools: ['recall'], instructions: 'Do stuff', default_context: 'operations',
          configurable: '[]',
        }],
      });
      // Insert copy
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'original_testuser', name: 'Original', source: 'user_created', created_at: '2026-01-01', usage_count: 0 }],
      });
      // Increment usage
      mockQueryPublic.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.installBlueprint('original', 'testuser-1234');
      expect(result.id).toBe('original_testuser');
      expect(mockQueryPublic).toHaveBeenCalledTimes(3);
    });

    it('throws for missing blueprint', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await expect(service.installBlueprint('nope', 'user')).rejects.toThrow('not found');
    });
  });

  describe('publishBlueprint', () => {
    const baseRow = {
      id: 'custom',
      source: 'user_created',
      user_id: 'user1',
      name: 'My Agent',
      description: 'orig desc',
      category: 'custom',
      tags: ['a'],
      tools: ['remember', 'recall'],
    };

    it('publishes user blueprint to community in pending state', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [baseRow] }) // ownership SELECT
        .mockResolvedValueOnce({ rows: [{ n: 0 }] }) // countRecentPublishes
        .mockResolvedValueOnce({ rows: [] }) // hasRecentDuplicate
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rowCount: 1 }); // INSERT publish_log

      await service.publishBlueprint('custom', 'user1');
      const updateSql = mockQueryPublic.mock.calls[3][0] as string;
      expect(updateSql).toContain("'community'");
      expect(updateSql).toContain("'pending'");

      const insertSql = mockQueryPublic.mock.calls[4][0] as string;
      expect(insertSql).toContain('agent_publish_log');
    });

    it('applies meta overrides for description/category/tags', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [baseRow] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await service.publishBlueprint('custom', 'user1', {
        description: 'new-desc',
        category: 'productivity',
        tags: ['alpha', 'beta'],
      });
      const updateParams = mockQueryPublic.mock.calls[3][1] as unknown[];
      expect(updateParams).toContain('new-desc');
      expect(updateParams).toContain('productivity');
      expect(updateParams).toContainEqual(['alpha', 'beta']);
    });

    it('throws PUBLISH_RATE_LIMIT when >=3 publishes in 24h', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [baseRow] })
        .mockResolvedValueOnce({ rows: [{ n: 3 }] }); // hits limit

      await expect(service.publishBlueprint('custom', 'user1'))
        .rejects.toMatchObject({ code: 'PUBLISH_RATE_LIMIT' });
    });

    it('throws PUBLISH_DUPLICATE when recent duplicate found', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [baseRow] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] })
        .mockResolvedValueOnce({ rows: [{ dup: 1 }] }); // duplicate hit

      await expect(service.publishBlueprint('custom', 'user1'))
        .rejects.toMatchObject({ code: 'PUBLISH_DUPLICATE' });
    });

    it('throws for non-owned blueprint', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await expect(service.publishBlueprint('custom', 'wrong-user'))
        .rejects.toThrow('not found or not owned');
    });
  });

  describe('hashTools', () => {
    it('normalizes order + case + whitespace', () => {
      const a = service.hashTools(['Recall', ' remember ', 'web_search']);
      const b = service.hashTools(['web_search', 'remember', 'recall']);
      expect(a).toBe(b);
    });

    it('changes when tool set changes', () => {
      const a = service.hashTools(['remember']);
      const b = service.hashTools(['remember', 'recall']);
      expect(a).not.toBe(b);
    });
  });

  describe('getPublishCandidate', () => {
    it('returns owner-scoped pre-fill', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'custom', name: 'My Agent', description: 'orig', icon: '🤖',
          category: 'custom', tags: ['a'], tools: ['remember'],
          approval_required: false, max_actions_per_day: 20, token_budget_daily: 60000,
        }],
      });
      const r = await service.getPublishCandidate('custom', 'user1');
      expect(r.blueprintId).toBe('custom');
      expect(r.tools).toEqual(['remember']);
      expect(r.maxActionsPerDay).toBe(20);
    });

    it('throws when blueprint not owned', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await expect(service.getPublishCandidate('custom', 'other'))
        .rejects.toThrow('not found or not owned');
    });
  });

  describe('unpublishBlueprint', () => {
    it('reverts source + resets moderation state', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ id: 'custom' }] })
        .mockResolvedValueOnce({ rowCount: 1 });
      await service.unpublishBlueprint('custom', 'user1');
      const updateSql = mockQueryPublic.mock.calls[1][0] as string;
      expect(updateSql).toContain("'user_created'");
      expect(updateSql).toContain("'approved'");
      expect(updateSql).toContain('published_at = NULL');
    });

    it('throws when blueprint not owned or not community', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await expect(service.unpublishBlueprint('custom', 'other'))
        .rejects.toThrow('not found or not owned');
    });
  });

  describe('listPendingBlueprints', () => {
    it('filters by source=community + moderation_status=pending', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.listPendingBlueprints();
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      expect(sql).toContain("source = 'community'");
      expect(sql).toContain("moderation_status = 'pending'");
    });

    it('maps moderation_reason + published_at to camelCase fields', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'bp1', name: 'Agent', description: null, icon: '🤖', category: 'custom',
          tags: [], tools: ['remember'], source: 'community',
          avg_rating: null, rating_count: 0, usage_count: 0,
          created_at: '2026-04-20', published_at: '2026-04-20',
          instructions: 'do', user_id: 'user1',
          moderation_reason: null,
        }],
      });
      const r = await service.listPendingBlueprints();
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe('bp1');
      expect(r[0].moderationReason).toBeNull();
      expect(r[0].userId).toBe('user1');
      expect(r[0].publishedAt).toBeInstanceOf(Date);
    });
  });

  describe('setModerationDecision', () => {
    it('approves pending blueprint', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rowCount: 1 });
      await service.setModerationDecision('bp1', 'admin1', 'approved');
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('approved');
      expect(params[1]).toBeNull();
    });

    it('rejects with reason', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rowCount: 1 });
      await service.setModerationDecision('bp1', 'admin1', 'rejected', 'violates TOS');
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('rejected');
      expect(params[1]).toBe('violates TOS');
    });

    it('requires reason on rejection', async () => {
      await expect(
        service.setModerationDecision('bp1', 'admin1', 'rejected'),
      ).rejects.toThrow('requires a reason');
    });

    it('throws when no pending row matched', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rowCount: 0 });
      await expect(
        service.setModerationDecision('bp1', 'admin1', 'approved'),
      ).rejects.toThrow('not found');
    });
  });

  describe('rateBlueprint', () => {
    it('creates rating and updates average', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'r1', blueprint_id: 'bp1', user_id: 'u1', rating: 5, review: 'Great!', created_at: '2026-01-01' }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.rateBlueprint('bp1', 'u1', 5, 'Great!');
      expect(result.rating).toBe(5);
      expect(result.review).toBe('Great!');
      expect(mockQueryPublic).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid rating', async () => {
      await expect(service.rateBlueprint('bp1', 'u1', 0)).rejects.toThrow('between 1 and 5');
      await expect(service.rateBlueprint('bp1', 'u1', 6)).rejects.toThrow('between 1 and 5');
    });

    it('handles upsert on duplicate', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'r1', blueprint_id: 'bp1', user_id: 'u1', rating: 4, review: null, created_at: '2026-01-01' }],
      });
      mockQueryPublic.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.rateBlueprint('bp1', 'u1', 4);
      expect(result.rating).toBe(4);
      expect(result.review).toBeNull();
    });
  });

  describe('getFeatured', () => {
    it('returns top-rated blueprints', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 'bp1', name: 'Top Agent', avg_rating: 4.8, rating_count: 20, usage_count: 500, created_at: '2026-01-01' },
          { id: 'bp2', name: 'Good Agent', avg_rating: 4.5, rating_count: 15, usage_count: 300, created_at: '2026-01-01' },
        ],
      });

      const result = await service.getFeatured(2);
      expect(result).toHaveLength(2);
      expect(result[0].rating).toBe(4.8);
    });

    it('defaults to limit 6', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.getFeatured();
      const params = mockQueryPublic.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(6);
    });

    it('orders featured=true before rating and usage', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      await service.getFeatured(3);
      const sql = mockQueryPublic.mock.calls[0][0] as string;
      const orderByIdx = sql.indexOf('ORDER BY');
      expect(orderByIdx).toBeGreaterThan(0);
      const orderBy = sql.slice(orderByIdx);
      const featuredIdx = orderBy.indexOf('featured');
      const ratingIdx = orderBy.indexOf('avg_rating');
      const usageIdx = orderBy.indexOf('usage_count');
      expect(featuredIdx).toBeGreaterThan(0);
      expect(featuredIdx).toBeLessThan(ratingIdx);
      expect(ratingIdx).toBeLessThan(usageIdx);
    });
  });

  describe('getRatingHistogram', () => {
    it('returns zero distribution when blueprint has no ratings', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      const h = await service.getRatingHistogram('bp1');
      expect(h.total).toBe(0);
      expect(h.average).toBeNull();
      expect(h.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });

    it('sums counts and computes average rounded to 2dp', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { rating: 5, n: 3 },
          { rating: 4, n: 2 },
          { rating: 3, n: 1 },
        ],
      });
      const h = await service.getRatingHistogram('bp1');
      expect(h.total).toBe(6);
      expect(h.distribution[5]).toBe(3);
      expect(h.distribution[4]).toBe(2);
      expect(h.distribution[3]).toBe(1);
      // (15 + 8 + 3) / 6 = 4.333..
      expect(h.average).toBe(4.33);
    });

    it('ignores rows outside 1..5 range', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { rating: 5, n: 2 },
          { rating: 7, n: 9 }, // corrupt row
        ],
      });
      const h = await service.getRatingHistogram('bp1');
      expect(h.total).toBe(2);
      expect(h.average).toBe(5);
    });
  });

  describe('getBlueprintDetail', () => {
    it('returns null when blueprint does not exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      const d = await service.getBlueprintDetail('nope');
      expect(d).toBeNull();
    });

    it('assembles base + histogram + reviews', async () => {
      // main SELECT
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 'bp1', name: 'Bp', description: null, icon: '🤖', category: 'custom',
          tags: [], type: 'autonomous', tools: ['remember'], source: 'community',
          avg_rating: 4.5, rating_count: 2, usage_count: 10, created_at: '2026-01-01',
          instructions: 'do', max_actions_per_day: 20, token_budget_daily: 100000,
          approval_required: true, featured: true,
        }],
      });
      // histogram
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ rating: 5, n: 1 }, { rating: 4, n: 1 }],
      });
      // recent reviews
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 'r1', rating: 5, review: 'Nice', created_at: '2026-01-01' }],
      });

      const d = await service.getBlueprintDetail('bp1');
      expect(d).not.toBeNull();
      expect(d!.id).toBe('bp1');
      expect(d!.featured).toBe(true);
      expect(d!.approvalRequired).toBe(true);
      expect(d!.maxActionsPerDay).toBe(20);
      expect(d!.tokenBudgetDaily).toBe(100000);
      expect(d!.histogram.total).toBe(2);
      expect(d!.histogram.average).toBe(4.5);
      expect(d!.recentReviews).toHaveLength(1);
      expect(d!.recentReviews[0].review).toBe('Nice');
    });
  });

  describe('getRatingEligibility', () => {
    it('returns not-installed when user has no installed copy', async () => {
      // install check
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      // rating check
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });

      const r = await service.getRatingEligibility('bp1', 'user-12345678-xyz');
      expect(r.installed).toBe(false);
      expect(r.eligible).toBe(false);
      expect(r.executionCount).toBe(0);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('returns eligible when installed, unrated, and 3+ executions', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ id: 'bp1_user1234' }] }) // install
        .mockResolvedValueOnce({ rows: [] }); // rating
      // 4 contexts × executions
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ n: 2 }] })
        .mockResolvedValueOnce({ rows: [{ n: 1 }] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] });

      const r = await service.getRatingEligibility('bp1', 'user1234-xyz');
      expect(r.installed).toBe(true);
      expect(r.alreadyRated).toBe(false);
      expect(r.executionCount).toBe(3);
      expect(r.eligible).toBe(true);
    });

    it('returns not-eligible when execution count is below threshold', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ id: 'bp1_user1234' }] })
        .mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValue({ rows: [{ n: 0 }] });
      // Override 2 of the 4 to give only 2 total
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ n: 1 }] })
        .mockResolvedValueOnce({ rows: [{ n: 1 }] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] });

      const r = await service.getRatingEligibility('bp1', 'user1234-xyz');
      expect(r.executionCount).toBe(2);
      expect(r.eligible).toBe(false);
    });

    it('returns alreadyRated + existing values when user has rated', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ id: 'bp1_user1234' }] })
        .mockResolvedValueOnce({ rows: [{ rating: 4, review: 'Good' }] });
      mockQueryContext.mockResolvedValue({ rows: [{ n: 10 }] });

      const r = await service.getRatingEligibility('bp1', 'user1234-xyz');
      expect(r.alreadyRated).toBe(true);
      expect(r.existingRating).toBe(4);
      expect(r.existingReview).toBe('Good');
      expect(r.eligible).toBe(false); // already rated → not eligible for a fresh rating
    });

    it('treats failing context queries as zero executions and still returns a result', async () => {
      mockQueryPublic
        .mockResolvedValueOnce({ rows: [{ id: 'bp1_user1234' }] })
        .mockResolvedValueOnce({ rows: [] });
      mockQueryContext
        .mockRejectedValueOnce(new Error('schema missing'))
        .mockResolvedValueOnce({ rows: [{ n: 3 }] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] });

      const r = await service.getRatingEligibility('bp1', 'user1234-xyz');
      expect(r.executionCount).toBe(3);
      expect(r.eligible).toBe(true);
    });
  });

  describe('singleton', () => {
    it('exports singleton instance', () => {
      expect(marketplaceService).toBeInstanceOf(MarketplaceService);
    });
  });
});
