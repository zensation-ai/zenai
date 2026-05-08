/**
 * Finance Page - Phase 4
 *
 * Main page with 4 tabs: Overview, Transactions, Budgets, Goals.
 * Uses HubPage for unified layout.
 */

import { useCallback } from 'react';
import { HubPage, type TabDef } from '../HubPage';
import { QueryErrorState } from '../QueryErrorState';
import { ListSkeleton, DashboardSkeleton } from '../skeletons/PageSkeletons';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { useFinanceData } from './useFinanceData';
import { OverviewTab } from './OverviewTab';
import { TransactionsTab } from './TransactionsTab';
import { BudgetsTab } from './BudgetsTab';
import { GoalsTab } from './GoalsTab';
import type { TransactionType } from './types';
import type { AIContext } from '../ContextSwitcher';
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
    basePath: '/cockpit/finanzen',
  });

  const {
    overview, transactions, transactionsTotal, accounts, budgets, goals, loading, error,
    fetchTransactions, refetchAll,
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
        <QueryErrorState error={error} refetch={refetchAll} />
      )}
      {activeTab === 'overview' && (
        loading
          ? <DashboardSkeleton />
          : <OverviewTab overview={overview} loading={loading} onCreateAccount={() => handleTabChange('transactions')} />
      )}
      {activeTab === 'transactions' && (
        loading
          ? <ListSkeleton rows={6} />
          : <TransactionsTab
              transactions={transactions}
              total={transactionsTotal}
              accounts={accounts}
              onSearch={handleTransactionSearch}
              onCreate={createTransaction}
              onDelete={deleteTransaction}
            />
      )}
      {activeTab === 'budgets' && (
        loading
          ? <ListSkeleton rows={4} />
          : <BudgetsTab
              budgets={budgets}
              onCreate={createBudget}
              onUpdate={updateBudget}
              onDelete={deleteBudget}
            />
      )}
      {activeTab === 'goals' && (
        loading
          ? <ListSkeleton rows={4} />
          : <GoalsTab
              goals={goals}
              onCreate={createGoal}
              onUpdate={updateGoal}
              onDelete={deleteGoal}
            />
      )}
    </HubPage>
  );
}
