/**
 * Finance Page - Phase 4
 *
 * Main page with 4 tabs: Overview, Transactions, Budgets, Goals.
 * Uses HubPage for unified layout.
 */

import { useCallback } from 'react';
import { HubPage, type TabDef } from '../HubPage';
import { QueryErrorState } from '../QueryErrorState';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { useFinanceData } from './useFinanceData';
import { OverviewTab } from './OverviewTab';
import { TransactionsTab } from './TransactionsTab';
import { BudgetsTab } from './BudgetsTab';
import { GoalsTab } from './GoalsTab';
import type { TransactionType } from './types';
import type { AIContext } from '../ContextSwitcher';
import './FinancePage.css';

type FinanceTab = 'overview' | 'transactions' | 'budgets' | 'goals';

const TABS: readonly TabDef<FinanceTab>[] = [
  { id: 'overview', label: 'Übersicht', icon: '📊' },
  { id: 'transactions', label: 'Transaktionen', icon: '💳' },
  { id: 'budgets', label: 'Budgets', icon: '📋' },
  { id: 'goals', label: 'Sparziele', icon: '🎯' },
];

const VALID_TABS = TABS.map(t => t.id);

interface FinancePageProps {
  context: AIContext;
  initialTab?: FinanceTab;
  onBack: () => void;
}

export function FinancePage({ context, initialTab = 'overview', onBack }: FinancePageProps) {
  const { activeTab, handleTabChange } = useTabNavigation<FinanceTab>({
    initialTab,
    validTabs: VALID_TABS,
    defaultTab: 'overview',
    basePath: '/finance',
  });

  const {
    overview, transactions, transactionsTotal, accounts, budgets, goals, loading, error,
    fetchTransactions,
    createTransaction, deleteTransaction,
    createBudget, updateBudget, deleteBudget,
    createGoal, updateGoal, deleteGoal,
  } = useFinanceData(context);

  const handleTransactionSearch = useCallback((filters: { search?: string; type?: TransactionType; category?: string }) => {
    fetchTransactions(filters);
  }, [fetchTransactions]);

  const subtitle = overview
    ? `${(overview.accounts || []).filter(a => a.is_active).length} Konten · ${budgets.length} Budgets · ${goals.filter(g => !g.is_completed).length} Ziele`
    : undefined;

  return (
    <HubPage
      title="Finanzen"
      icon="💰"
      subtitle={subtitle}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      ariaLabel="Finanzen Navigation"
    >
      {error && !loading && (
        <QueryErrorState error={error} refetch={() => fetchTransactions()} />
      )}
      {activeTab === 'overview' && (
        <OverviewTab overview={overview} loading={loading} />
      )}
      {activeTab === 'transactions' && (
        <TransactionsTab
          transactions={transactions}
          total={transactionsTotal}
          accounts={accounts}
          onSearch={handleTransactionSearch}
          onCreate={createTransaction}
          onDelete={deleteTransaction}
        />
      )}
      {activeTab === 'budgets' && (
        <BudgetsTab
          budgets={budgets}
          onCreate={createBudget}
          onUpdate={updateBudget}
          onDelete={deleteBudget}
        />
      )}
      {activeTab === 'goals' && (
        <GoalsTab
          goals={goals}
          onCreate={createGoal}
          onUpdate={updateGoal}
          onDelete={deleteGoal}
        />
      )}
    </HubPage>
  );
}
