import { getUserCredits, deductCredits, resetMonthlyCredits, PLAN_CREDIT_LIMITS } from '../../../services/billing';

jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

const { queryPublic } = jest.requireMock('../../../utils/database-context') as {
  queryPublic: jest.Mock;
};

describe('Credit Tracking', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('PLAN_CREDIT_LIMITS', () => {
    it('defines limits for all tiers', () => {
      expect(PLAN_CREDIT_LIMITS.free).toBe(50);
      expect(PLAN_CREDIT_LIMITS.pro).toBe(2000);
      expect(PLAN_CREDIT_LIMITS.enterprise).toBeGreaterThan(10000);
    });
  });

  describe('getUserCredits', () => {
    it('returns credit balance from database', async () => {
      queryPublic.mockResolvedValueOnce({
        rows: [{ credits_remaining: 1800, credits_used: 200, plan: 'pro', credits_limit: 2000 }],
      });
      const result = await getUserCredits('user-1');
      expect(result).toEqual({
        remaining: 1800,
        used: 200,
        limit: 2000,
        plan: 'pro',
      });
    });

    it('returns free tier defaults when no credit record exists', async () => {
      // No credit row found
      queryPublic.mockResolvedValueOnce({ rows: [] });
      // getUserPlan fallback also finds no subscription
      queryPublic.mockResolvedValueOnce({ rows: [] });

      const result = await getUserCredits('user-1');
      expect(result).toEqual({
        remaining: PLAN_CREDIT_LIMITS.free,
        used: 0,
        limit: PLAN_CREDIT_LIMITS.free,
        plan: 'free',
      });
    });

    it('returns pro limits when user has pro subscription but no credit row', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });
      queryPublic.mockResolvedValueOnce({ rows: [{ plan: 'pro' }] });

      const result = await getUserCredits('user-1');
      expect(result).toEqual({
        remaining: PLAN_CREDIT_LIMITS.pro,
        used: 0,
        limit: PLAN_CREDIT_LIMITS.pro,
        plan: 'pro',
      });
    });
  });

  describe('deductCredits', () => {
    it('deducts credits and returns updated balance', async () => {
      queryPublic
        .mockResolvedValueOnce({
          rows: [{ credits_remaining: 45, credits_used: 5, plan: 'free', credits_limit: 50 }],
        })
        .mockResolvedValueOnce({ rows: [] }); // credit_transactions INSERT

      const result = await deductCredits('user-1', 5, 'chat_message');
      expect(result.remaining).toBe(45);
      expect(result.used).toBe(5);
      expect(queryPublic).toHaveBeenCalledTimes(2);
    });

    it('throws when insufficient credits', async () => {
      queryPublic.mockResolvedValueOnce({ rows: [] });
      await expect(deductCredits('user-1', 5, 'chat_message')).rejects.toThrow('Insufficient credits');
    });

    it('records the transaction with metadata', async () => {
      queryPublic
        .mockResolvedValueOnce({
          rows: [{ credits_remaining: 95, credits_used: 5, plan: 'pro', credits_limit: 2000 }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await deductCredits('user-1', 5, 'code_execution', { language: 'python' });

      const insertCall = queryPublic.mock.calls[1];
      expect(insertCall[0]).toContain('credit_transactions');
      expect(insertCall[1]).toContain('user-1');
      expect(insertCall[1]).toContain(-5);
      expect(insertCall[1]).toContain('code_execution');
    });
  });

  describe('resetMonthlyCredits', () => {
    it('resets expired credit periods and returns count', async () => {
      queryPublic.mockResolvedValueOnce({ rowCount: 3 });
      const count = await resetMonthlyCredits();
      expect(count).toBe(3);
      expect(queryPublic).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        [],
      );
    });

    it('returns 0 when no periods expired', async () => {
      queryPublic.mockResolvedValueOnce({ rowCount: 0 });
      const count = await resetMonthlyCredits();
      expect(count).toBe(0);
    });
  });
});
