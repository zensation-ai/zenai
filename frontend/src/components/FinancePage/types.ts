/**
 * Finance Types - Phase 4
 */

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
  tags: string[];
  ai_category: string | null;
  ai_category_confidence: number | null;
  created_at: string;
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
  usage_percent?: number;
  is_over_threshold?: boolean;
  created_at: string;
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
  progress_percent?: number;
  created_at: string;
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

export interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

// Labels
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Girokonto',
  savings: 'Sparkonto',
  credit: 'Kreditkarte',
  cash: 'Bargeld',
  investment: 'Investment',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Einnahme',
  expense: 'Ausgabe',
  transfer: 'Umbuchung',
};

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  quarterly: 'Quartal',
  yearly: 'Jährlich',
};

export const GOAL_PRIORITY_LABELS: Record<GoalPriority, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
};

export const DEFAULT_CATEGORIES = [
  'Lebensmittel', 'Restaurant', 'Transport', 'Wohnung', 'Strom/Gas',
  'Internet/Telefon', 'Versicherung', 'Gesundheit', 'Kleidung', 'Freizeit',
  'Bildung', 'Abonnements', 'Gehalt', 'Freelance', 'Sonstiges',
];
