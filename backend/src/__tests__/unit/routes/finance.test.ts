/**
 * Finance Route Tests - Phase 41
 *
 * Tests financial overview, accounts CRUD, transactions CRUD,
 * budgets CRUD, and goals CRUD.
 */

import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock validation
jest.mock('../../../utils/validation', () => ({
  validateContextParam: jest.fn((ctx: string) => ctx),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// Mock database-context
jest.mock('../../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
  queryContext: jest.fn(),
}));

// Mock finance service
const mockGetOverview = jest.fn();
const mockGetCategoryBreakdown = jest.fn();
const mockGetAccounts = jest.fn();
const mockGetAccount = jest.fn();
const mockCreateAccount = jest.fn();
const mockUpdateAccount = jest.fn();
const mockDeleteAccount = jest.fn();
const mockGetTransactions = jest.fn();
const mockGetTransaction = jest.fn();
const mockCreateTransaction = jest.fn();
const mockUpdateTransaction = jest.fn();
const mockDeleteTransaction = jest.fn();
const mockGetBudgets = jest.fn();
const mockGetBudget = jest.fn();
const mockCreateBudget = jest.fn();
const mockUpdateBudget = jest.fn();
const mockDeleteBudget = jest.fn();
const mockGetGoals = jest.fn();
const mockGetGoal = jest.fn();
const mockCreateGoal = jest.fn();
const mockUpdateGoal = jest.fn();
const mockDeleteGoal = jest.fn();

jest.mock('../../../services/finance', () => ({
  getOverview: (...args: unknown[]) => mockGetOverview(...args),
  getCategoryBreakdown: (...args: unknown[]) => mockGetCategoryBreakdown(...args),
  getAccounts: (...args: unknown[]) => mockGetAccounts(...args),
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
  createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  updateAccount: (...args: unknown[]) => mockUpdateAccount(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
  getTransactions: (...args: unknown[]) => mockGetTransactions(...args),
  getTransaction: (...args: unknown[]) => mockGetTransaction(...args),
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
  updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
  deleteTransaction: (...args: unknown[]) => mockDeleteTransaction(...args),
  getBudgets: (...args: unknown[]) => mockGetBudgets(...args),
  getBudget: (...args: unknown[]) => mockGetBudget(...args),
  createBudget: (...args: unknown[]) => mockCreateBudget(...args),
  updateBudget: (...args: unknown[]) => mockUpdateBudget(...args),
  deleteBudget: (...args: unknown[]) => mockDeleteBudget(...args),
  getGoals: (...args: unknown[]) => mockGetGoals(...args),
  getGoal: (...args: unknown[]) => mockGetGoal(...args),
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
  updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
  deleteGoal: (...args: unknown[]) => mockDeleteGoal(...args),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Finance Routes', () => {
  let app: express.Express;

  beforeAll(async () => {
    const { financeRouter } = await import('../../../routes/finance');
    app = express();
    app.use(express.json());
    app.use('/api', financeRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path return values
    mockGetOverview.mockResolvedValue({ totalBalance: 5000, income: 3000, expenses: 2000 });
    mockGetCategoryBreakdown.mockResolvedValue([{ category: 'Food', total: 500 }]);
    mockGetAccounts.mockResolvedValue([{ id: UUID, name: 'Checking', balance: 3000 }]);
    mockGetAccount.mockResolvedValue({ id: UUID, name: 'Checking', balance: 3000 });
    mockCreateAccount.mockResolvedValue({ id: 'new-acc', name: 'Savings' });
    mockUpdateAccount.mockResolvedValue({ id: UUID, name: 'Updated Account' });
    mockDeleteAccount.mockResolvedValue(true);
    mockGetTransactions.mockResolvedValue({ transactions: [{ id: UUID, amount: 50 }], total: 1 });
    mockGetTransaction.mockResolvedValue({ id: UUID, amount: 50, payee: 'Grocery Store' });
    mockCreateTransaction.mockResolvedValue({ id: 'new-tx', amount: 100 });
    mockUpdateTransaction.mockResolvedValue({ id: UUID, amount: 75 });
    mockDeleteTransaction.mockResolvedValue(true);
    mockGetBudgets.mockResolvedValue([{ id: UUID, category: 'Food', amount: 500 }]);
    mockGetBudget.mockResolvedValue({ id: UUID, category: 'Food', amount: 500 });
    mockCreateBudget.mockResolvedValue({ id: 'new-bdg', category: 'Transport' });
    mockUpdateBudget.mockResolvedValue({ id: UUID, amount: 600 });
    mockDeleteBudget.mockResolvedValue(true);
    mockGetGoals.mockResolvedValue([{ id: UUID, name: 'Emergency Fund', target: 10000 }]);
    mockGetGoal.mockResolvedValue({ id: UUID, name: 'Emergency Fund', target: 10000 });
    mockCreateGoal.mockResolvedValue({ id: 'new-goal', name: 'Vacation' });
    mockUpdateGoal.mockResolvedValue({ id: UUID, name: 'Updated Goal' });
    mockDeleteGoal.mockResolvedValue(true);
  });

  // ===========================================
  // Overview
  // ===========================================
  describe('GET /api/:context/finance/overview', () => {
    it('should return financial overview', async () => {
      const res = await request(app).get('/api/personal/finance/overview');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalBalance).toBe(5000);
    });

    it('should accept months parameter', async () => {
      const res = await request(app).get('/api/personal/finance/overview?months=3');
      expect(res.status).toBe(200);
      expect(mockGetOverview).toHaveBeenCalledWith('personal', 3);
    });
  });

  describe('GET /api/:context/finance/categories', () => {
    it('should return category breakdown', async () => {
      const res = await request(app).get('/api/personal/finance/categories');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('Food');
    });
  });

  // ===========================================
  // Accounts CRUD
  // ===========================================
  describe('GET /api/:context/finance/accounts', () => {
    it('should list accounts', async () => {
      const res = await request(app).get('/api/personal/finance/accounts');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/finance/accounts/:id', () => {
    it('should return an account', async () => {
      const res = await request(app).get(`/api/personal/finance/accounts/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Checking');
    });

    it('should return 404 for non-existent account', async () => {
      mockGetAccount.mockResolvedValueOnce(null);
      const res = await request(app).get(`/api/personal/finance/accounts/${UUID}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const { isValidUUID } = require('../../../utils/validation');
      isValidUUID.mockReturnValueOnce(false);
      const res = await request(app).get('/api/personal/finance/accounts/bad-id');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/finance/accounts', () => {
    it('should create an account', async () => {
      const res = await request(app)
        .post('/api/personal/finance/accounts')
        .send({ name: 'Savings', account_type: 'savings' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/:context/finance/accounts/:id', () => {
    it('should update an account', async () => {
      const res = await request(app)
        .put(`/api/personal/finance/accounts/${UUID}`)
        .send({ name: 'Updated Account' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Account');
    });

    it('should return 404 for non-existent account', async () => {
      mockUpdateAccount.mockResolvedValueOnce(null);
      const res = await request(app)
        .put(`/api/personal/finance/accounts/${UUID}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/finance/accounts/:id', () => {
    it('should delete an account', async () => {
      const res = await request(app).delete(`/api/personal/finance/accounts/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent account', async () => {
      mockDeleteAccount.mockResolvedValueOnce(false);
      const res = await request(app).delete(`/api/personal/finance/accounts/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Transactions CRUD
  // ===========================================
  describe('GET /api/:context/finance/transactions', () => {
    it('should list transactions', async () => {
      const res = await request(app).get('/api/personal/finance/transactions');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/:context/finance/transactions/:id', () => {
    it('should return a transaction', async () => {
      const res = await request(app).get(`/api/personal/finance/transactions/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.payee).toBe('Grocery Store');
    });

    it('should return 404 for non-existent transaction', async () => {
      mockGetTransaction.mockResolvedValueOnce(null);
      const res = await request(app).get(`/api/personal/finance/transactions/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/finance/transactions', () => {
    it('should create a transaction', async () => {
      const res = await request(app)
        .post('/api/personal/finance/transactions')
        .send({ amount: 100, payee: 'Store', account_id: UUID });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/:context/finance/transactions/:id', () => {
    it('should update a transaction', async () => {
      const res = await request(app)
        .put(`/api/personal/finance/transactions/${UUID}`)
        .send({ amount: 75 });
      expect(res.status).toBe(200);
      expect(res.body.data.amount).toBe(75);
    });

    it('should return 404 for non-existent transaction', async () => {
      mockUpdateTransaction.mockResolvedValueOnce(null);
      const res = await request(app)
        .put(`/api/personal/finance/transactions/${UUID}`)
        .send({ amount: 0 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/finance/transactions/:id', () => {
    it('should delete a transaction', async () => {
      const res = await request(app).delete(`/api/personal/finance/transactions/${UUID}`);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent transaction', async () => {
      mockDeleteTransaction.mockResolvedValueOnce(false);
      const res = await request(app).delete(`/api/personal/finance/transactions/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Budgets CRUD
  // ===========================================
  describe('GET /api/:context/finance/budgets', () => {
    it('should list budgets', async () => {
      const res = await request(app).get('/api/personal/finance/budgets');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/finance/budgets/:id', () => {
    it('should return a budget', async () => {
      const res = await request(app).get(`/api/personal/finance/budgets/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.category).toBe('Food');
    });

    it('should return 404 for non-existent budget', async () => {
      mockGetBudget.mockResolvedValueOnce(null);
      const res = await request(app).get(`/api/personal/finance/budgets/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/finance/budgets', () => {
    it('should create a budget', async () => {
      const res = await request(app)
        .post('/api/personal/finance/budgets')
        .send({ category: 'Transport', amount: 200 });
      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/:context/finance/budgets/:id', () => {
    it('should update a budget', async () => {
      const res = await request(app)
        .put(`/api/personal/finance/budgets/${UUID}`)
        .send({ amount: 600 });
      expect(res.status).toBe(200);
      expect(res.body.data.amount).toBe(600);
    });

    it('should return 404 for non-existent budget', async () => {
      mockUpdateBudget.mockResolvedValueOnce(null);
      const res = await request(app)
        .put(`/api/personal/finance/budgets/${UUID}`)
        .send({ amount: 0 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/finance/budgets/:id', () => {
    it('should delete a budget', async () => {
      const res = await request(app).delete(`/api/personal/finance/budgets/${UUID}`);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent budget', async () => {
      mockDeleteBudget.mockResolvedValueOnce(false);
      const res = await request(app).delete(`/api/personal/finance/budgets/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Goals CRUD
  // ===========================================
  describe('GET /api/:context/finance/goals', () => {
    it('should list goals', async () => {
      const res = await request(app).get('/api/personal/finance/goals');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/:context/finance/goals/:id', () => {
    it('should return a goal', async () => {
      const res = await request(app).get(`/api/personal/finance/goals/${UUID}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Emergency Fund');
    });

    it('should return 404 for non-existent goal', async () => {
      mockGetGoal.mockResolvedValueOnce(null);
      const res = await request(app).get(`/api/personal/finance/goals/${UUID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/finance/goals', () => {
    it('should create a goal', async () => {
      const res = await request(app)
        .post('/api/personal/finance/goals')
        .send({ name: 'Vacation', target: 5000 });
      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/:context/finance/goals/:id', () => {
    it('should update a goal', async () => {
      const res = await request(app)
        .put(`/api/personal/finance/goals/${UUID}`)
        .send({ name: 'Updated Goal' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Goal');
    });

    it('should return 404 for non-existent goal', async () => {
      mockUpdateGoal.mockResolvedValueOnce(null);
      const res = await request(app)
        .put(`/api/personal/finance/goals/${UUID}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/finance/goals/:id', () => {
    it('should delete a goal', async () => {
      const res = await request(app).delete(`/api/personal/finance/goals/${UUID}`);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent goal', async () => {
      mockDeleteGoal.mockResolvedValueOnce(false);
      const res = await request(app).delete(`/api/personal/finance/goals/${UUID}`);
      expect(res.status).toBe(404);
    });
  });
});
