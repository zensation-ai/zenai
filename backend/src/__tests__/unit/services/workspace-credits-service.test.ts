jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import * as creditsService from '../../../services/workspace-credits-service';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('workspace-credits-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('getCredits', () => {
    it('returns workspace credit state', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', credits_limit: 2000, credits_used: 150, plan: 'pro' }],
      } as any);

      const result = await creditsService.getCredits('ws-1');
      expect(result.remaining).toBe(1850);
      expect(result.percentUsed).toBeCloseTo(7.5);
    });

    it('throws when workspace credits not found (empty rows)', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      await expect(creditsService.getCredits('ws-nonexistent'))
        .rejects.toThrow('Workspace credits not found');
    });
  });

  describe('deductCredits', () => {
    it('deducts and logs usage', async () => {
      // Update credits
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', credits_used: 153, credits_limit: 2000 }],
      } as any);
      // Insert log
      mockQueryPublic.mockResolvedValueOnce({ rows: [{}] } as any);

      const result = await creditsService.deductCredits({
        workspaceId: 'ws-1', userId: 'user-1',
        actionType: 'chat', creditsSpent: 3, modelUsed: 'claude-sonnet',
      });
      expect(result.credits_used).toBe(153);
    });

    it('throws when workspace not found or insufficient credits', async () => {
      // UPDATE returns no rows when workspace_id doesn't match or credits insufficient
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as any);

      await expect(creditsService.deductCredits({
        workspaceId: 'ws-nonexistent', userId: 'user-1',
        actionType: 'chat', creditsSpent: 5, modelUsed: 'claude-sonnet',
      })).rejects.toThrow('Insufficient credits or workspace not found');
    });

    it('returns overage state when limit exceeded', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ workspace_id: 'ws-1', credits_used: 2001, credits_limit: 2000 }],
      } as any);
      mockQueryPublic.mockResolvedValueOnce({ rows: [{}] } as any);

      const result = await creditsService.deductCredits({
        workspaceId: 'ws-1', userId: 'user-1',
        actionType: 'chat', creditsSpent: 1, modelUsed: 'claude-haiku',
      });
      expect(result.credits_used).toBeGreaterThan(result.credits_limit);
    });
  });

  describe('checkOverage', () => {
    it('returns none at 50%', () => {
      expect(creditsService.checkOverageLevel(500, 1000)).toBe('none');
    });
    it('returns info at 75%', () => {
      expect(creditsService.checkOverageLevel(750, 1000)).toBe('info');
    });
    it('returns warning at 90%', () => {
      expect(creditsService.checkOverageLevel(900, 1000)).toBe('warning');
    });
    it('returns exceeded at 100%', () => {
      expect(creditsService.checkOverageLevel(1000, 1000)).toBe('exceeded');
    });
  });

  describe('resetMonthlyCredits', () => {
    it('resets credits for all expired periods', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rowCount: 5 } as any);
      const count = await creditsService.resetMonthlyCredits();
      expect(count).toBe(5);
    });
  });
});
