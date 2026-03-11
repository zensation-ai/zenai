/**
 * Finance Service - Phase 4
 *
 * Context-aware financial management: accounts, transactions, budgets, goals.
 */

import { queryContext, AIContext, QueryParam } from '../utils/database-context';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type BudgetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type GoalPriority = 'low' | 'medium' | 'high';

export interface FinancialAccount {
  id: string;
  name: string;
  account_type: AccountType;
  currency: string;
  balance: number;
  institution: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  account_id: string | null;
  amount: number;
  currency: string;
  transaction_type: TransactionType;
  category: string | null;
  subcategory: string | null;
  payee: string | null;
  description: string | null;
  transaction_date: string;
  is_recurring: boolean;
  recurring_id: string | null;
  tags: string[];
  receipt_url: string | null;
  ai_category: string | null;
  ai_category_confidence: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  account_name?: string;
}

export interface Budget {
  id: string;
  name: string;
  category: string;
  amount_limit: number;
  period: BudgetPeriod;
  current_spent: number;
  alert_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed
  usage_percent?: number;
  is_over_threshold?: boolean;
}

export interface FinancialGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  category: string | null;
  priority: GoalPriority;
  is_completed: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Computed
  progress_percent?: number;
}

export interface TransactionFilters {
  account_id?: string;
  transaction_type?: TransactionType;
  category?: string;
  payee?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
  is_recurring?: boolean;
  limit?: number;
  offset?: number;
}

export interface FinancialOverview {
  total_balance: number;
  total_income: number;
  total_expenses: number;
  net: number;
  accounts: FinancialAccount[];
  top_categories: { category: string; total: number; count: number }[];
  monthly_trend: { month: string; income: number; expenses: number }[];
  active_budgets: Budget[];
  active_goals: FinancialGoal[];
}

// ============================================================
// Accounts
// ============================================================

export async function createAccount(
  context: AIContext,
  input: Partial<FinancialAccount>
): Promise<FinancialAccount> {
  const result = await queryContext(context,
    `INSERT INTO financial_accounts (name, account_type, currency, balance, institution, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.name,
      input.account_type || 'checking',
      input.currency || 'EUR',
      input.balance || 0,
      input.institution || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
  return result.rows[0];
}

export async function getAccounts(context: AIContext): Promise<FinancialAccount[]> {
  const result = await queryContext(context,
    `SELECT * FROM financial_accounts ORDER BY is_active DESC, name ASC`
  );
  return result.rows;
}

export async function getAccount(context: AIContext, id: string): Promise<FinancialAccount | null> {
  const result = await queryContext(context,
    `SELECT * FROM financial_accounts WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateAccount(
  context: AIContext,
  id: string,
  updates: Partial<FinancialAccount>
): Promise<FinancialAccount | null> {
  const fields: string[] = [];
  const params: QueryParam[] = [];
  let idx = 1;

  const allowedFields = ['name', 'account_type', 'currency', 'balance', 'institution', 'is_active', 'metadata'];
  for (const field of allowedFields) {
    if (field in updates) {
      const value = (updates as Record<string, unknown>)[field];
      fields.push(`${field} = $${idx}`);
      params.push(field === 'metadata' ? JSON.stringify(value) : value as QueryParam);
      idx++;
    }
  }
  if (fields.length === 0) {return getAccount(context, id);}

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await queryContext(context,
    `UPDATE financial_accounts SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function deleteAccount(context: AIContext, id: string): Promise<boolean> {
  const result = await queryContext(context,
    `DELETE FROM financial_accounts WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Transactions
// ============================================================

export async function createTransaction(
  context: AIContext,
  input: Partial<Transaction>
): Promise<Transaction> {
  const result = await queryContext(context,
    `INSERT INTO transactions
       (account_id, amount, currency, transaction_type, category, subcategory,
        payee, description, transaction_date, is_recurring, recurring_id, tags,
        receipt_url, ai_category, ai_category_confidence, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      input.account_id || null,
      input.amount,
      input.currency || 'EUR',
      input.transaction_type || 'expense',
      input.category || null,
      input.subcategory || null,
      input.payee || null,
      input.description || null,
      input.transaction_date || new Date().toISOString().split('T')[0],
      input.is_recurring || false,
      input.recurring_id || null,
      input.tags || [],
      input.receipt_url || null,
      input.ai_category || null,
      input.ai_category_confidence || null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  // Update account balance if linked
  if (input.account_id && input.amount) {
    const balanceChange = input.transaction_type === 'income'
      ? Math.abs(input.amount)
      : -Math.abs(input.amount);
    await queryContext(context,
      `UPDATE financial_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [balanceChange, input.account_id]
    );
  }

  // Update budget spent if category matches
  if (input.category && input.transaction_type === 'expense') {
    await updateBudgetSpent(context, input.category, Math.abs(input.amount ?? 0));
  }

  return result.rows[0];
}

export async function getTransactions(
  context: AIContext,
  filters: TransactionFilters = {}
): Promise<{ transactions: Transaction[]; total: number }> {
  const conditions: string[] = [];
  const params: QueryParam[] = [];
  let idx = 1;

  if (filters.account_id) {
    conditions.push(`t.account_id = $${idx++}`);
    params.push(filters.account_id);
  }
  if (filters.transaction_type) {
    conditions.push(`t.transaction_type = $${idx++}`);
    params.push(filters.transaction_type);
  }
  if (filters.category) {
    conditions.push(`t.category = $${idx++}`);
    params.push(filters.category);
  }
  if (filters.payee) {
    conditions.push(`t.payee ILIKE $${idx++}`);
    params.push(`%${filters.payee}%`);
  }
  if (filters.search) {
    conditions.push(`(t.payee ILIKE $${idx} OR t.description ILIKE $${idx} OR t.category ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters.date_from) {
    conditions.push(`t.transaction_date >= $${idx++}`);
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`t.transaction_date <= $${idx++}`);
    params.push(filters.date_to);
  }
  if (filters.min_amount !== undefined) {
    conditions.push(`ABS(t.amount) >= $${idx++}`);
    params.push(filters.min_amount);
  }
  if (filters.max_amount !== undefined) {
    conditions.push(`ABS(t.amount) <= $${idx++}`);
    params.push(filters.max_amount);
  }
  if (filters.is_recurring !== undefined) {
    conditions.push(`t.is_recurring = $${idx++}`);
    params.push(filters.is_recurring);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Count query uses only filter params; data query adds limit/offset
  const countParams = [...params];
  params.push(limit, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const [dataResult, countResult] = await Promise.all([
    queryContext(context,
      `SELECT t.*, fa.name as account_name
       FROM transactions t
       LEFT JOIN financial_accounts fa ON t.account_id = fa.id
       ${where}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    ),
    queryContext(context,
      `SELECT COUNT(*) as total FROM transactions t ${where}`,
      countParams
    ),
  ]);

  return {
    transactions: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
  };
}

export async function getTransaction(context: AIContext, id: string): Promise<Transaction | null> {
  const result = await queryContext(context,
    `SELECT t.*, fa.name as account_name
     FROM transactions t
     LEFT JOIN financial_accounts fa ON t.account_id = fa.id
     WHERE t.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateTransaction(
  context: AIContext,
  id: string,
  updates: Partial<Transaction>
): Promise<Transaction | null> {
  const fields: string[] = [];
  const params: QueryParam[] = [];
  let idx = 1;

  const allowedFields = [
    'account_id', 'amount', 'currency', 'transaction_type', 'category',
    'subcategory', 'payee', 'description', 'transaction_date', 'is_recurring',
    'tags', 'receipt_url', 'metadata',
  ];
  for (const field of allowedFields) {
    if (field in updates) {
      const value = (updates as Record<string, unknown>)[field];
      fields.push(`${field} = $${idx}`);
      params.push(field === 'metadata' ? JSON.stringify(value) : value as QueryParam);
      idx++;
    }
  }
  if (fields.length === 0) {return getTransaction(context, id);}

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await queryContext(context,
    `UPDATE transactions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

export async function deleteTransaction(context: AIContext, id: string): Promise<boolean> {
  // Get transaction to reverse balance
  const tx = await getTransaction(context, id);
  if (!tx) {return false;}

  const result = await queryContext(context,
    `DELETE FROM transactions WHERE id = $1`,
    [id]
  );

  // Reverse account balance
  if (tx.account_id && tx.amount) {
    const reversal = tx.transaction_type === 'income'
      ? -Math.abs(tx.amount)
      : Math.abs(tx.amount);
    await queryContext(context,
      `UPDATE financial_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [reversal, tx.account_id]
    );
  }

  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Budgets
// ============================================================

export async function createBudget(
  context: AIContext,
  input: Partial<Budget>
): Promise<Budget> {
  const result = await queryContext(context,
    `INSERT INTO budgets (name, category, amount_limit, period, alert_threshold)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.name,
      input.category,
      input.amount_limit,
      input.period || 'monthly',
      input.alert_threshold ?? 0.80,
    ]
  );
  return enrichBudget(result.rows[0]);
}

export async function getBudgets(context: AIContext, activeOnly = true): Promise<Budget[]> {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const result = await queryContext(context,
    `SELECT * FROM budgets ${where} ORDER BY category ASC`
  );
  return result.rows.map(enrichBudget);
}

export async function getBudget(context: AIContext, id: string): Promise<Budget | null> {
  const result = await queryContext(context,
    `SELECT * FROM budgets WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? enrichBudget(result.rows[0]) : null;
}

export async function updateBudget(
  context: AIContext,
  id: string,
  updates: Partial<Budget>
): Promise<Budget | null> {
  const fields: string[] = [];
  const params: QueryParam[] = [];
  let idx = 1;

  const allowedFields = ['name', 'category', 'amount_limit', 'period', 'current_spent', 'alert_threshold', 'is_active'];
  for (const field of allowedFields) {
    if (field in updates) {
      fields.push(`${field} = $${idx}`);
      params.push((updates as Record<string, unknown>)[field] as QueryParam);
      idx++;
    }
  }
  if (fields.length === 0) {return getBudget(context, id);}

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await queryContext(context,
    `UPDATE budgets SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0] ? enrichBudget(result.rows[0]) : null;
}

export async function deleteBudget(context: AIContext, id: string): Promise<boolean> {
  const result = await queryContext(context,
    `DELETE FROM budgets WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

async function updateBudgetSpent(context: AIContext, category: string, amount: number): Promise<void> {
  try {
    await queryContext(context,
      `UPDATE budgets SET current_spent = current_spent + $1, updated_at = NOW()
       WHERE category = $2 AND is_active = TRUE`,
      [amount, category]
    );
  } catch {
    logger.warn(`Failed to update budget for category ${category}`);
  }
}

function enrichBudget(budget: Budget): Budget {
  const limit = Number(budget.amount_limit) || 1;
  const spent = Number(budget.current_spent) || 0;
  return {
    ...budget,
    amount_limit: Number(budget.amount_limit),
    current_spent: spent,
    usage_percent: Math.round((spent / limit) * 100),
    is_over_threshold: spent / limit >= (Number(budget.alert_threshold) || 0.8),
  };
}

// ============================================================
// Goals
// ============================================================

export async function createGoal(
  context: AIContext,
  input: Partial<FinancialGoal>
): Promise<FinancialGoal> {
  const result = await queryContext(context,
    `INSERT INTO financial_goals (name, target_amount, current_amount, deadline, category, priority, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.name,
      input.target_amount,
      input.current_amount || 0,
      input.deadline || null,
      input.category || null,
      input.priority || 'medium',
      JSON.stringify(input.metadata || {}),
    ]
  );
  return enrichGoal(result.rows[0]);
}

export async function getGoals(context: AIContext, activeOnly = true): Promise<FinancialGoal[]> {
  const where = activeOnly ? 'WHERE is_completed = FALSE' : '';
  const result = await queryContext(context,
    `SELECT * FROM financial_goals ${where} ORDER BY deadline ASC NULLS LAST, priority DESC`
  );
  return result.rows.map(enrichGoal);
}

export async function getGoal(context: AIContext, id: string): Promise<FinancialGoal | null> {
  const result = await queryContext(context,
    `SELECT * FROM financial_goals WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? enrichGoal(result.rows[0]) : null;
}

export async function updateGoal(
  context: AIContext,
  id: string,
  updates: Partial<FinancialGoal>
): Promise<FinancialGoal | null> {
  const fields: string[] = [];
  const params: QueryParam[] = [];
  let idx = 1;

  const allowedFields = ['name', 'target_amount', 'current_amount', 'deadline', 'category', 'priority', 'is_completed', 'metadata'];
  for (const field of allowedFields) {
    if (field in updates) {
      const value = (updates as Record<string, unknown>)[field];
      fields.push(`${field} = $${idx}`);
      params.push(field === 'metadata' ? JSON.stringify(value) : value as QueryParam);
      idx++;
    }
  }
  if (fields.length === 0) {return getGoal(context, id);}

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await queryContext(context,
    `UPDATE financial_goals SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0] ? enrichGoal(result.rows[0]) : null;
}

export async function deleteGoal(context: AIContext, id: string): Promise<boolean> {
  const result = await queryContext(context,
    `DELETE FROM financial_goals WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

function enrichGoal(goal: FinancialGoal): FinancialGoal {
  const target = Number(goal.target_amount) || 1;
  const current = Number(goal.current_amount) || 0;
  return {
    ...goal,
    target_amount: target,
    current_amount: current,
    progress_percent: Math.min(100, Math.round((current / target) * 100)),
  };
}

// ============================================================
// Overview & Analytics
// ============================================================

export async function getOverview(context: AIContext, months = 6): Promise<FinancialOverview> {
  const [accounts, topCats, monthlyTrend, budgets, goals, incomeTotals, expenseTotals] = await Promise.all([
    getAccounts(context),
    queryContext(context,
      `SELECT category, SUM(ABS(amount)) as total, COUNT(*) as count
       FROM transactions
       WHERE transaction_type = 'expense' AND category IS NOT NULL
         AND transaction_date >= (CURRENT_DATE - INTERVAL '${months} months')
       GROUP BY category ORDER BY total DESC LIMIT 10`
    ),
    queryContext(context,
      `SELECT TO_CHAR(transaction_date, 'YYYY-MM') as month,
              SUM(CASE WHEN transaction_type = 'income' THEN ABS(amount) ELSE 0 END) as income,
              SUM(CASE WHEN transaction_type = 'expense' THEN ABS(amount) ELSE 0 END) as expenses
       FROM transactions
       WHERE transaction_date >= (CURRENT_DATE - INTERVAL '${months} months')
       GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
       ORDER BY month ASC`
    ),
    getBudgets(context),
    getGoals(context),
    queryContext(context,
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
       WHERE transaction_type = 'income'
         AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)`
    ),
    queryContext(context,
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
       WHERE transaction_type = 'expense'
         AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)`
    ),
  ]);

  const totalBalance = accounts
    .filter(a => a.is_active)
    .reduce((sum, a) => sum + Number(a.balance), 0);
  const totalIncome = Number(incomeTotals.rows[0]?.total || 0);
  const totalExpenses = Number(expenseTotals.rows[0]?.total || 0);

  return {
    total_balance: totalBalance,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net: totalIncome - totalExpenses,
    accounts,
    top_categories: topCats.rows.map(r => ({
      category: r.category,
      total: Number(r.total),
      count: Number(r.count),
    })),
    monthly_trend: monthlyTrend.rows.map(r => ({
      month: r.month,
      income: Number(r.income),
      expenses: Number(r.expenses),
    })),
    active_budgets: budgets,
    active_goals: goals,
  };
}

export async function getCategoryBreakdown(
  context: AIContext,
  dateFrom?: string,
  dateTo?: string
): Promise<{ category: string; total: number; count: number; percentage: number }[]> {
  const conditions: string[] = [`transaction_type = 'expense'`];
  const params: QueryParam[] = [];
  let idx = 1;

  if (dateFrom) {
    conditions.push(`transaction_date >= $${idx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`transaction_date <= $${idx++}`);
    params.push(dateTo);
  }

  const result = await queryContext(context,
    `SELECT COALESCE(category, 'Unkategorisiert') as category,
            SUM(ABS(amount)) as total, COUNT(*) as count
     FROM transactions
     WHERE ${conditions.join(' AND ')}
     GROUP BY category ORDER BY total DESC`
    , params
  );

  const grandTotal = result.rows.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.total), 0) || 1;
  return result.rows.map((r: Record<string, unknown>) => ({
    category: String(r.category),
    total: Number(r.total),
    count: Number(r.count),
    percentage: Math.round((Number(r.total) / grandTotal) * 100),
  }));
}
