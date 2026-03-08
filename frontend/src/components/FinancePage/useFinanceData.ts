/**
 * Finance Data Hook - Phase 4
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type {
  FinancialAccount, Transaction, Budget, FinancialGoal,
  FinancialOverview, TransactionType,
} from './types';

const API = import.meta.env.VITE_API_URL || '';
const headers = { 'x-api-key': import.meta.env.VITE_API_KEY || '' };

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

  const fetchOverview = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/${context}/finance/overview`, { headers });
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

      const res = await axios.get(`${API}/api/${context}/finance/transactions?${params}`, { headers });
      setTransactions(res.data.data);
      setTransactionsTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch transactions', err);
    }
  }, [context]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/${context}/finance/accounts`, { headers });
      setAccounts(res.data.data);
    } catch (err) {
      console.error('Failed to fetch accounts', err);
    }
  }, [context]);

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/${context}/finance/budgets`, { headers });
      setBudgets(res.data.data);
    } catch (err) {
      console.error('Failed to fetch budgets', err);
    }
  }, [context]);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/${context}/finance/goals?active=false`, { headers });
      setGoals(res.data.data);
    } catch (err) {
      console.error('Failed to fetch goals', err);
    }
  }, [context]);

  // CRUD Operations
  const createTransaction = useCallback(async (data: Partial<Transaction>) => {
    await axios.post(`${API}/api/${context}/finance/transactions`, data, { headers });
    await Promise.all([fetchTransactions(), fetchOverview(), fetchAccounts()]);
  }, [context, fetchTransactions, fetchOverview, fetchAccounts]);

  const deleteTransaction = useCallback(async (id: string) => {
    await axios.delete(`${API}/api/${context}/finance/transactions/${id}`, { headers });
    await Promise.all([fetchTransactions(), fetchOverview(), fetchAccounts()]);
  }, [context, fetchTransactions, fetchOverview, fetchAccounts]);

  const createAccount = useCallback(async (data: Partial<FinancialAccount>) => {
    await axios.post(`${API}/api/${context}/finance/accounts`, data, { headers });
    await fetchAccounts();
  }, [context, fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    await axios.delete(`${API}/api/${context}/finance/accounts/${id}`, { headers });
    await fetchAccounts();
  }, [context, fetchAccounts]);

  const createBudget = useCallback(async (data: Partial<Budget>) => {
    await axios.post(`${API}/api/${context}/finance/budgets`, data, { headers });
    await fetchBudgets();
  }, [context, fetchBudgets]);

  const updateBudget = useCallback(async (id: string, data: Partial<Budget>) => {
    await axios.put(`${API}/api/${context}/finance/budgets/${id}`, data, { headers });
    await fetchBudgets();
  }, [context, fetchBudgets]);

  const deleteBudget = useCallback(async (id: string) => {
    await axios.delete(`${API}/api/${context}/finance/budgets/${id}`, { headers });
    await fetchBudgets();
  }, [context, fetchBudgets]);

  const createGoal = useCallback(async (data: Partial<FinancialGoal>) => {
    await axios.post(`${API}/api/${context}/finance/goals`, data, { headers });
    await fetchGoals();
  }, [context, fetchGoals]);

  const updateGoal = useCallback(async (id: string, data: Partial<FinancialGoal>) => {
    await axios.put(`${API}/api/${context}/finance/goals/${id}`, data, { headers });
    await fetchGoals();
  }, [context, fetchGoals]);

  const deleteGoal = useCallback(async (id: string) => {
    await axios.delete(`${API}/api/${context}/finance/goals/${id}`, { headers });
    await fetchGoals();
  }, [context, fetchGoals]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverview(), fetchTransactions(), fetchAccounts(), fetchBudgets(), fetchGoals()])
      .finally(() => setLoading(false));
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
