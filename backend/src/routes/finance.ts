/**
 * Finance Routes - Phase 4
 *
 * REST API for financial accounts, transactions, budgets, and goals.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AIContext } from '../utils/database-context';
import { isValidUUID, validateContextParam } from '../utils/validation';
import { getUserId } from '../utils/user-context';
import * as financeService from '../services/finance';

const router = Router();

router.use(apiKeyAuth);

// ============================================================
// Helpers
// ============================================================

function getContext(req: Request): AIContext {
  return validateContextParam(req.params.context);
}

function validateId(res: Response, id: string): boolean {
  if (!isValidUUID(id)) {
    res.status(400).json({ success: false, error: 'Invalid ID format' });
    return false;
  }
  return true;
}

// ============================================================
// Overview
// ============================================================

router.get('/:context/finance/overview', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const months = parseInt(req.query.months as string) || 6;
  const overview = await financeService.getOverview(getContext(req), months, userId);
  res.json({ success: true, data: overview });
}));

router.get('/:context/finance/categories', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { date_from, date_to } = req.query;
  const breakdown = await financeService.getCategoryBreakdown(
    getContext(req),
    date_from as string | undefined,
    date_to as string | undefined,
    userId
  );
  res.json({ success: true, data: breakdown });
}));

// ============================================================
// Accounts
// ============================================================

router.get('/:context/finance/accounts', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const accounts = await financeService.getAccounts(getContext(req), userId);
  res.json({ success: true, data: accounts });
}));

router.get('/:context/finance/accounts/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const account = await financeService.getAccount(getContext(req), req.params.id, userId);
  if (!account) {
    res.status(404).json({ success: false, error: 'Account not found' });
    return;
  }
  res.json({ success: true, data: account });
}));

router.post('/:context/finance/accounts', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const account = await financeService.createAccount(getContext(req), req.body, userId);
  res.status(201).json({ success: true, data: account });
}));

router.put('/:context/finance/accounts/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const account = await financeService.updateAccount(getContext(req), req.params.id, req.body, userId);
  if (!account) {
    res.status(404).json({ success: false, error: 'Account not found' });
    return;
  }
  res.json({ success: true, data: account });
}));

router.delete('/:context/finance/accounts/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const deleted = await financeService.deleteAccount(getContext(req), req.params.id, userId);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Account not found' });
    return;
  }
  res.json({ success: true });
}));

// ============================================================
// Transactions
// ============================================================

router.get('/:context/finance/transactions', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const filters: financeService.TransactionFilters = {
    account_id: req.query.account_id as string | undefined,
    transaction_type: req.query.type as financeService.TransactionType | undefined,
    category: req.query.category as string | undefined,
    payee: req.query.payee as string | undefined,
    search: req.query.search as string | undefined,
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
    min_amount: req.query.min_amount ? parseFloat(req.query.min_amount as string) : undefined,
    max_amount: req.query.max_amount ? parseFloat(req.query.max_amount as string) : undefined,
    is_recurring: req.query.is_recurring === 'true' ? true : req.query.is_recurring === 'false' ? false : undefined,
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
  };
  const result = await financeService.getTransactions(getContext(req), filters, userId);
  res.json({ success: true, data: result.transactions, total: result.total });
}));

router.get('/:context/finance/transactions/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const tx = await financeService.getTransaction(getContext(req), req.params.id, userId);
  if (!tx) {
    res.status(404).json({ success: false, error: 'Transaction not found' });
    return;
  }
  res.json({ success: true, data: tx });
}));

router.post('/:context/finance/transactions', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const tx = await financeService.createTransaction(getContext(req), req.body, userId);
  res.status(201).json({ success: true, data: tx });
}));

router.put('/:context/finance/transactions/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const tx = await financeService.updateTransaction(getContext(req), req.params.id, req.body, userId);
  if (!tx) {
    res.status(404).json({ success: false, error: 'Transaction not found' });
    return;
  }
  res.json({ success: true, data: tx });
}));

router.delete('/:context/finance/transactions/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const deleted = await financeService.deleteTransaction(getContext(req), req.params.id, userId);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Transaction not found' });
    return;
  }
  res.json({ success: true });
}));

// ============================================================
// Budgets
// ============================================================

router.get('/:context/finance/budgets', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const activeOnly = req.query.active !== 'false';
  const budgets = await financeService.getBudgets(getContext(req), activeOnly, userId);
  res.json({ success: true, data: budgets });
}));

router.get('/:context/finance/budgets/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const budget = await financeService.getBudget(getContext(req), req.params.id, userId);
  if (!budget) {
    res.status(404).json({ success: false, error: 'Budget not found' });
    return;
  }
  res.json({ success: true, data: budget });
}));

router.post('/:context/finance/budgets', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const budget = await financeService.createBudget(getContext(req), req.body, userId);
  res.status(201).json({ success: true, data: budget });
}));

router.put('/:context/finance/budgets/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const budget = await financeService.updateBudget(getContext(req), req.params.id, req.body, userId);
  if (!budget) {
    res.status(404).json({ success: false, error: 'Budget not found' });
    return;
  }
  res.json({ success: true, data: budget });
}));

router.delete('/:context/finance/budgets/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const deleted = await financeService.deleteBudget(getContext(req), req.params.id, userId);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Budget not found' });
    return;
  }
  res.json({ success: true });
}));

// ============================================================
// Goals
// ============================================================

router.get('/:context/finance/goals', asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const activeOnly = req.query.active !== 'false';
  const goals = await financeService.getGoals(getContext(req), activeOnly, userId);
  res.json({ success: true, data: goals });
}));

router.get('/:context/finance/goals/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const goal = await financeService.getGoal(getContext(req), req.params.id, userId);
  if (!goal) {
    res.status(404).json({ success: false, error: 'Goal not found' });
    return;
  }
  res.json({ success: true, data: goal });
}));

router.post('/:context/finance/goals', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const goal = await financeService.createGoal(getContext(req), req.body, userId);
  res.status(201).json({ success: true, data: goal });
}));

router.put('/:context/finance/goals/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const goal = await financeService.updateGoal(getContext(req), req.params.id, req.body, userId);
  if (!goal) {
    res.status(404).json({ success: false, error: 'Goal not found' });
    return;
  }
  res.json({ success: true, data: goal });
}));

router.delete('/:context/finance/goals/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  if (!validateId(res, req.params.id)) {return;}
  const userId = getUserId(req);
  const deleted = await financeService.deleteGoal(getContext(req), req.params.id, userId);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Goal not found' });
    return;
  }
  res.json({ success: true });
}));

export { router as financeRouter };
