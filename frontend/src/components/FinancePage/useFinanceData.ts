/**
 * Finance Data Hook - Phase 4
 *
 * Uses global axios instance (with auth interceptor from main.tsx).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type {
  FinancialAccount, Transaction, Budget, FinancialGoal,
  FinancialOverview, TransactionType,
} from './types';

const API_URL = import.meta.env.VITE_API_URL || '';

interface TransactionFilters {
  account_id?: string;
  type?: TransactionType;
  category?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export function useFinanceData(context: string) {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/finance/overview`);
      setOverview(res.data.data);
    } catch (err) {
      console.error('Failed to fetch overview', err);
    }
  }, [context]);

  const fetchTransactions = useCallback(async (filters: TransactionFilters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.account_id) params.set('account_id', filters.account_id);
      if (filters.type) params.set('type', filters.type);
      if (filters.category) params.set('category', filters.category);
      if (filters.search) params.set('search', filters.search);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      params.set('limit', '50');

      const res = await axios.get(`${API_URL}/api/${context}/finance/transactions?${params}`);
      setTransactions(res.data.data);
      setTransactionsTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch transactions', err);
    }
  }, [context]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/finance/accounts`);
      setAccounts(res.data.data);
    } catch (err) {
      console.error('Failed to fetch accounts', err);
    }
  }, [context]);

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/finance/budgets`);
      setBudgets(res.data.data);
    } catch (err) {
      console.error('Failed to fetch budgets', err);
    }
  }, [context]);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/finance/goals?active=false`);
      setGoals(res.data.data);
    } catch (err) {
      console.error('Failed to fetch goals', err);
    }
  }, [context]);

  // CRUD Operations
  const createTransaction = useCallback(async (data: Partial<Transaction>) => {
    await axios.post(`${API_URL}/api/${context}/finance/transactions`, data);
    await Promise.all([fetchTransactions(), fetchOverview(), fetchAccounts()]);
  }, [context, fetchTransactions, fetchOverview, fetchAccounts]);

  const deleteTransaction = useCallback(async (id: string) => {
    await axios.delete(`${API_URL}/api/${context}/finance/transactions/${id}`);
    await Promise.all([fetchTransactions(), fetchOverview(), fetchAccounts()]);
  }, [context, fetchTransactions, fetchOverview, fetchAccounts]);

  const createAccount = useCallback(async (data: Partial<FinancialAccount>) => {
    await axios.post(`${API_URL}/api/${context}/finance/accounts`, data);
    await fetchAccounts();
  }, [context, fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    await axios.delete(`${API_URL}/api/${context}/finance/accounts/${id}`);
    await fetchAccounts();
  }, [context, fetchAccounts]);

  const createBudget = useCallback(async (data: Partial<Budget>) => {
    await axios.post(`${API_URL}/api/${context}/finance/budgets`, data);
    await fetchBudgets();
  }, [context, fetchBudgets]);

  const updateBudget = useCallback(async (id: string, data: Partial<Budget>) => {
    await axios.put(`${API_URL}/api/${context}/finance/budgets/${id}`, data);
    await fetchBudgets();
  }, [context, fetchBudgets]);

  const deleteBudget = useCallback(async (id: string) => {
    await axios.delete(`${API_URL}/api/${context}/finance/budgets/${id}`);
    await fetchBudgets();
  }, [context, fetchBudgets]);

  const createGoal = useCallback(async (data: Partial<FinancialGoal>) => {
    await axios.post(`${API_URL}/api/${context}/finance/goals`, data);
    await fetchGoals();
  }, [context, fetchGoals]);

  const updateGoal = useCallback(async (id: string, data: Partial<FinancialGoal>) => {
    await axios.put(`${API_URL}/api/${context}/finance/goals/${id}`, data);
    await fetchGoals();
  }, [context, fetchGoals]);

  const deleteGoal = useCallback(async (id: string) => {
    await axios.delete(`${API_URL}/api/${context}/finance/goals/${id}`);
    await fetchGoals();
  }, [context, fetchGoals]);

  // Initial load with cleanup
  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    Promise.all([fetchOverview(), fetchTransactions(), fetchAccounts(), fetchBudgets(), fetchGoals()])
      .finally(() => setLoading(false));

    return () => {
      ctrl.abort();
      abortRef.current = null;
    };
  }, [fetchOverview, fetchTransactions, fetchAccounts, fetchBudgets, fetchGoals]);

  return {
    overview, transactions, transactionsTotal, accounts, budgets, goals, loading,
    fetchTransactions, fetchOverview,
    createTransaction, deleteTransaction,
    createAccount, deleteAccount,
    createBudget, updateBudget, deleteBudget,
    createGoal, updateGoal, deleteGoal,
  };
}
