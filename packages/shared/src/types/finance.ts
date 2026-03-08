/**
 * Finance types (Phase 4: Personal Finance Management)
 */

export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type BudgetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface FinancialAccount {
  id: string;
  name: string;
  account_type: AccountType;
  currency: string;
  balance: number;
  institution?: string;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id?: string;
  amount: number;
  currency: string;
  transaction_type: TransactionType;
  category?: string;
  subcategory?: string;
  payee?: string;
  description?: string;
  transaction_date: string;
  is_recurring: boolean;
  recurring_id?: string;
  tags?: string[];
  receipt_url?: string;
  ai_category_confidence?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
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
}

export interface FinancialGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string;
  category?: string;
  priority: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}
