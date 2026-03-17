/**
 * React Query hooks for Finance (accounts, transactions, budgets, goals)
 *
 * @module hooks/queries/useFinance
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Types
// ===========================================

export interface FinanceOverview {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
}

export interface FinanceAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
}

export interface FinanceTransaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  account_id: string;
}

// ===========================================
// Query Hooks
// ===========================================

/**
 * Fetch financial overview
 */
export function useFinanceOverviewQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.overview(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/finance/overview`, { signal });
      return (response.data?.data ?? response.data) as FinanceOverview;
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch financial accounts
 */
export function useFinanceAccountsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.accounts(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/finance/accounts`, { signal });
      return (response.data?.data ?? response.data?.accounts ?? []) as FinanceAccount[];
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch transactions with optional filters
 */
export function useFinanceTransactionsQuery(
  context: AIContext,
  filters?: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.finance.transactions(context, filters),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/finance/transactions`, {
        signal,
        params: filters,
      });
      return (response.data?.data ?? response.data?.transactions ?? []) as FinanceTransaction[];
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Fetch budgets
 */
export function useFinanceBudgetsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.budgets(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/finance/budgets`, { signal });
      return response.data?.data ?? response.data?.budgets ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch financial goals
 */
export function useFinanceGoalsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.goals(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/finance/goals`, { signal });
      return response.data?.data ?? response.data?.goals ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch category spending breakdown
 */
export function useFinanceCategoriesQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.categories(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/finance/categories`, { signal });
      return response.data?.data ?? response.data ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

// ===========================================
// Mutation Hooks
// ===========================================

/**
 * Create a financial transaction
 */
export function useCreateTransactionMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<FinanceTransaction>) => {
      const response = await axios.post(`/api/${context}/finance/transactions`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all(context) });
    },
    onError: (error) => {
      logError('useCreateTransactionMutation', error);
    },
  });
}
