/**
 * Finance Service Tests
 *
 * Tests for financial accounts, transactions, budgets, and goals CRUD.
 */

// Mock database
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../utils/user-context', () => ({
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

import {
  createAccount,
  getAccounts,
  getAccount,
  updateAccount,
  deleteAccount,
  createTransaction,
  getTransactions,
  getTransaction,
  deleteTransaction,
  createBudget,
  getBudgets,
  getBudget,
  deleteBudget,
  createGoal,
  getGoals,
  getGoal,
} from '../../../services/finance';

const SYSTEM_USER = '00000000-0000-0000-0000-000000000001';

describe('Finance Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ============================================================
  // Accounts
  // ============================================================

  describe('createAccount', () => {
    it('should create a financial account with defaults', async () => {
      const account = { id: 'a-1', name: 'Checking', account_type: 'checking', currency: 'EUR', balance: 0 };
      mockQueryContext.mockResolvedValueOnce({ rows: [account] });

      const result = await createAccount('personal', { name: 'Checking' });

      expect(result).toEqual(account);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO financial_accounts'),
        expect.arrayContaining(['Checking'])
      );
    });

    it('should use provided userId', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'a-2' }] });

      await createAccount('work', { name: 'Biz Account' }, 'user-42');

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params[params.length - 1]).toBe('user-42');
    });
  });

  describe('getAccounts', () => {
    it('should return accounts ordered', async () => {
      const accounts = [
        { id: 'a-1', name: 'Savings', is_active: true },
        { id: 'a-2', name: 'Cash', is_active: false },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: accounts });

      const result = await getAccounts('personal');

      expect(result).toHaveLength(2);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('ORDER BY'),
        [SYSTEM_USER]
      );
    });
  });

  describe('getAccount', () => {
    it('should return account by id', async () => {
      const account = { id: 'a-1', name: 'Checking' };
      mockQueryContext.mockResolvedValueOnce({ rows: [account] });

      const result = await getAccount('personal', 'a-1');
      expect(result).toEqual(account);
    });

    it('should return null if not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await getAccount('personal', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateAccount', () => {
    it('should update specified fields', async () => {
      const updated = { id: 'a-1', name: 'Updated', balance: 500 };
      mockQueryContext.mockResolvedValueOnce({ rows: [updated] });

      const result = await updateAccount('personal', 'a-1', { name: 'Updated', balance: 500 });

      expect(result).toEqual(updated);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('UPDATE financial_accounts');
    });

    it('should return current account when no updates', async () => {
      const existing = { id: 'a-1', name: 'Existing' };
      mockQueryContext.mockResolvedValueOnce({ rows: [existing] });

      const result = await updateAccount('personal', 'a-1', {});

      expect(result).toEqual(existing);
    });
  });

  describe('deleteAccount', () => {
    it('should return true on delete', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });
      expect(await deleteAccount('personal', 'a-1')).toBe(true);
    });

    it('should return false when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0 });
      expect(await deleteAccount('personal', 'nope')).toBe(false);
    });
  });

  // ============================================================
  // Transactions
  // ============================================================

  describe('createTransaction', () => {
    it('should create a transaction and update account balance for expense', async () => {
      const tx = { id: 'tx-1', amount: 50, transaction_type: 'expense', account_id: 'a-1' };
      mockQueryContext
        .mockResolvedValueOnce({ rows: [tx] }) // INSERT transaction
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE account balance
        .mockResolvedValueOnce({ rowCount: 0 }); // UPDATE budget spent (no match)

      const result = await createTransaction('personal', {
        amount: 50,
        transaction_type: 'expense',
        account_id: 'a-1',
        category: 'food',
      });

      expect(result).toEqual(tx);
      // Balance update should subtract for expense
      const balanceCall = mockQueryContext.mock.calls[1][2] as number[];
      expect(balanceCall[0]).toBe(-50);
    });

    it('should add balance for income transactions', async () => {
      const tx = { id: 'tx-2', amount: 1000, transaction_type: 'income', account_id: 'a-1' };
      mockQueryContext
        .mockResolvedValueOnce({ rows: [tx] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await createTransaction('personal', {
        amount: 1000,
        transaction_type: 'income',
        account_id: 'a-1',
      });

      const balanceCall = mockQueryContext.mock.calls[1][2] as number[];
      expect(balanceCall[0]).toBe(1000);
    });
  });

  describe('getTransactions', () => {
    it('should return transactions with total', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1', payee: 'Store' }] })
        .mockResolvedValueOnce({ rows: [{ total: '15' }] });

      const result = await getTransactions('personal', { category: 'food' });

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(15);
    });
  });

  describe('deleteTransaction', () => {
    it('should reverse account balance on delete', async () => {
      // getTransaction (called inside deleteTransaction)
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'tx-1', amount: 100, transaction_type: 'expense', account_id: 'a-1' }],
      });
      // DELETE
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });
      // balance reversal
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });

      const result = await deleteTransaction('personal', 'tx-1');

      expect(result).toBe(true);
      // Should reverse the expense (add back)
      const reversalCall = mockQueryContext.mock.calls[2][2] as number[];
      expect(reversalCall[0]).toBe(100);
    });

    it('should return false for nonexistent transaction', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await deleteTransaction('personal', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  // ============================================================
  // Budgets
  // ============================================================

  describe('createBudget', () => {
    it('should create budget with enriched fields', async () => {
      const budget = { id: 'b-1', name: 'Food', category: 'food', amount_limit: 200, current_spent: 0, alert_threshold: 0.8 };
      mockQueryContext.mockResolvedValueOnce({ rows: [budget] });

      const result = await createBudget('personal', {
        name: 'Food',
        category: 'food',
        amount_limit: 200,
      });

      expect(result.usage_percent).toBe(0);
      expect(result.is_over_threshold).toBe(false);
    });
  });

  describe('getBudgets', () => {
    it('should return enriched budgets', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'b-1', amount_limit: 100, current_spent: 90, alert_threshold: 0.8 }],
      });

      const result = await getBudgets('personal');

      expect(result[0].usage_percent).toBe(90);
      expect(result[0].is_over_threshold).toBe(true);
    });

    it('should return empty array if table does not exist', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('relation "budgets" does not exist'));

      const result = await getBudgets('personal');
      expect(result).toEqual([]);
    });
  });

  describe('deleteBudget', () => {
    it('should return true on delete', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });
      expect(await deleteBudget('personal', 'b-1')).toBe(true);
    });
  });

  // ============================================================
  // Goals
  // ============================================================

  describe('createGoal', () => {
    it('should create a goal with progress', async () => {
      const goal = { id: 'g-1', name: 'Vacation', target_amount: 5000, current_amount: 1000, is_completed: false };
      mockQueryContext.mockResolvedValueOnce({ rows: [goal] });

      const result = await createGoal('personal', { name: 'Vacation', target_amount: 5000, current_amount: 1000 });

      expect(result.progress_percent).toBe(20);
    });
  });

  describe('getGoals', () => {
    it('should filter active only by default', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await getGoals('personal');

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('is_completed = FALSE');
    });
  });

  describe('getGoal', () => {
    it('should return null when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      expect(await getGoal('personal', 'nonexistent')).toBeNull();
    });
  });
});
