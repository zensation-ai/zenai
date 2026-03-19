/**
 * Finance Overview Tab - Phase 4
 */

import { Wallet } from 'lucide-react';
import type { FinancialOverview } from './types';
import { ACCOUNT_TYPE_LABELS } from './types';

interface OverviewTabProps {
  overview: FinancialOverview | null;
  loading: boolean;
  onCreateAccount?: () => void;
}

function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
}

export function OverviewTab({ overview, loading, onCreateAccount }: OverviewTabProps) {
  if (loading || !overview) {
    return <div className="finance-loading">Lade Finanzen...</div>;
  }

  return (
    <div className="finance-overview">
      {/* Summary Cards */}
      <div className="overview-cards">
        <div className="overview-card balance">
          <span className="card-label">Gesamtsaldo</span>
          <span className="card-value">{formatCurrency(overview.total_balance)}</span>
        </div>
        <div className="overview-card income">
          <span className="card-label">Einnahmen (Monat)</span>
          <span className="card-value positive">+{formatCurrency(overview.total_income)}</span>
        </div>
        <div className="overview-card expenses">
          <span className="card-label">Ausgaben (Monat)</span>
          <span className="card-value negative">-{formatCurrency(overview.total_expenses)}</span>
        </div>
        <div className="overview-card net">
          <span className="card-label">Netto (Monat)</span>
          <span className={`card-value ${overview.net >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(overview.net)}
          </span>
        </div>
      </div>

      {/* Accounts */}
      {overview.accounts.length > 0 && (
        <div className="overview-section">
          <h3>Konten</h3>
          <div className="accounts-grid">
            {overview.accounts.filter(a => a.is_active).map(account => (
              <div key={account.id} className="account-card">
                <div className="account-info">
                  <span className="account-name">{account.name}</span>
                  <span className="account-type">{ACCOUNT_TYPE_LABELS[account.account_type]}</span>
                </div>
                <span className={`account-balance ${Number(account.balance) >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(Number(account.balance), account.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Categories */}
      {overview.top_categories.length > 0 && (
        <div className="overview-section">
          <h3>Top Ausgaben-Kategorien</h3>
          <div className="category-bars">
            {overview.top_categories.slice(0, 5).map(cat => {
              const maxTotal = overview.top_categories[0]?.total || 1;
              const widthPercent = Math.round((cat.total / maxTotal) * 100);
              return (
                <div key={cat.category} className="category-bar-row">
                  <span className="category-label">{cat.category}</span>
                  <div className="category-bar-track">
                    <div className="category-bar-fill" style={{ width: `${widthPercent}%` }} />
                  </div>
                  <span className="category-amount">{formatCurrency(cat.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Trend */}
      {overview.monthly_trend.length > 0 && (
        <div className="overview-section">
          <h3>Monatlicher Verlauf</h3>
          <div className="trend-table">
            <div className="trend-header">
              <span>Monat</span>
              <span>Einnahmen</span>
              <span>Ausgaben</span>
              <span>Netto</span>
            </div>
            {overview.monthly_trend.map(m => (
              <div key={m.month} className="trend-row">
                <span>{m.month}</span>
                <span className="positive">+{formatCurrency(m.income)}</span>
                <span className="negative">-{formatCurrency(m.expenses)}</span>
                <span className={m.income - m.expenses >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(m.income - m.expenses)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget Alerts */}
      {overview.active_budgets.filter(b => b.is_over_threshold).length > 0 && (
        <div className="overview-section">
          <h3>Budget-Warnungen</h3>
          <div className="budget-alerts">
            {overview.active_budgets.filter(b => b.is_over_threshold).map(budget => (
              <div key={budget.id} className="budget-alert">
                <span className="alert-icon">⚠️</span>
                <span>{budget.name}: {budget.usage_percent}% von {formatCurrency(budget.amount_limit)} verbraucht</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {overview.accounts.length === 0 && overview.top_categories.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Wallet size={40} strokeWidth={1.5} style={{ marginBottom: '16px', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--text-primary)' }}>Keine Finanzdaten</h3>
          <p style={{ margin: '0 0 16px', fontSize: '14px', maxWidth: '360px' }}>Erstelle dein erstes Konto um Finanzen zu tracken.</p>
          {onCreateAccount && (
            <button className="ds-button ds-button--primary ds-button--sm" type="button" onClick={onCreateAccount}>
              Konto erstellen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
