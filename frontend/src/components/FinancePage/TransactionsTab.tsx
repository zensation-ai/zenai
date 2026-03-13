/**
 * Transactions Tab - Phase 4
 */

import { useState, useCallback } from 'react';
import type { Transaction, FinancialAccount, TransactionType } from './types';
import { TRANSACTION_TYPE_LABELS, DEFAULT_CATEGORIES } from './types';
import { useEscapeKey } from '../../hooks/useClickOutside';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAnnounce } from '../../hooks/useAnnounce';
import { useConfirm } from '../ConfirmDialog';

interface TransactionsTabProps {
  transactions: Transaction[];
  total: number;
  accounts: FinancialAccount[];
  onSearch: (filters: { search?: string; type?: TransactionType; category?: string }) => void;
  onCreate: (data: Partial<Transaction>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function TransactionsTab({ transactions, total, accounts, onSearch, onCreate, onDelete }: TransactionsTabProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  const [showForm, setShowForm] = useState(false);
  useEscapeKey(() => setShowForm(false), showForm);
  const focusTrapRef = useFocusTrap<HTMLDivElement>({ isActive: showForm });
  const announce = useAnnounce();
  const [formData, setFormData] = useState({
    amount: '',
    transaction_type: 'expense' as TransactionType,
    category: '',
    payee: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    account_id: '',
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    onSearch({ search: value || undefined, type: filterType || undefined });
  }, [onSearch, filterType]);

  const handleFilterType = useCallback((type: TransactionType | '') => {
    setFilterType(type);
    onSearch({ search: search || undefined, type: type || undefined });
  }, [onSearch, search]);

  const handleSubmit = useCallback(async () => {
    if (!formData.amount) return;
    await onCreate({
      amount: parseFloat(formData.amount),
      transaction_type: formData.transaction_type,
      category: formData.category || undefined,
      payee: formData.payee || undefined,
      description: formData.description || undefined,
      transaction_date: formData.transaction_date,
      account_id: formData.account_id || undefined,
    } as Partial<Transaction>);
    announce('Transaktion erstellt');
    setShowForm(false);
    setFormData({
      amount: '', transaction_type: 'expense', category: '', payee: '',
      description: '', transaction_date: new Date().toISOString().split('T')[0], account_id: '',
    });
  }, [formData, onCreate]);

  const confirm = useConfirm();

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirm({ title: 'Löschen', message: 'Transaktion wirklich löschen?', confirmText: 'Löschen', variant: 'danger' });
    if (!confirmed) return;
    await onDelete(id);
    announce('Transaktion gelöscht', 'assertive');
  }, [onDelete, confirm, announce]);

  return (
    <div className="transactions-tab">
      {/* Search + Filters */}
      <div className="finance-toolbar">
        <input
          type="text"
          className="finance-search-input"
          placeholder="Suche nach Empfänger, Beschreibung..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          aria-label="Transaktionen durchsuchen"
        />
        <div className="finance-filter-chips">
          <button
            className={`finance-filter-chip ${!filterType ? 'active' : ''}`}
            onClick={() => handleFilterType('')}
          >Alle</button>
          {(Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[]).map(type => (
            <button
              key={type}
              className={`finance-filter-chip ${filterType === type ? 'active' : ''}`}
              onClick={() => handleFilterType(type)}
            >{TRANSACTION_TYPE_LABELS[type]}</button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Transaktion</button>
      </div>

      {/* Transaction List */}
      <div className="finance-count">{total} Transaktionen</div>
      <div className="transaction-list">
        {transactions.map(tx => (
          <div key={tx.id} className="transaction-item">
            <div className={`tx-indicator ${tx.transaction_type}`} />
            <div className="tx-info">
              <div className="tx-main">
                <span className="tx-payee">{tx.payee || tx.description || 'Unbenannt'}</span>
                {tx.category && <span className="tx-category">{tx.category}</span>}
              </div>
              <div className="tx-meta">
                <span>{formatDate(tx.transaction_date)}</span>
                {tx.account_name && <span>· {tx.account_name}</span>}
                {tx.is_recurring && <span>· 🔄</span>}
              </div>
            </div>
            <div className="tx-amount-col">
              <span className={`tx-amount ${tx.transaction_type === 'income' ? 'positive' : 'negative'}`}>
                {tx.transaction_type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
              </span>
              <button
                className="contact-action-btn danger"
                onClick={() => handleDelete(tx.id)}
                title="Löschen"
              >✕</button>
            </div>
          </div>
        ))}
        {transactions.length === 0 && (
          <div className="finance-empty">
            <span className="finance-empty-icon">📝</span>
            <p>Keine Transaktionen</p>
          </div>
        )}
      </div>

      {/* Transaction Form Modal */}
      {showForm && (
        <div className="contact-form-overlay" onClick={() => setShowForm(false)} role="presentation">
          <div ref={focusTrapRef} className="contact-form-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Neue Transaktion">
            <div className="contact-form-header">
              <h2>Neue Transaktion</h2>
              <button className="contact-form-close" onClick={() => setShowForm(false)} aria-label="Schliessen">✕</button>
            </div>
            <div className="contact-form">
              <div className="form-row two-col">
                <div className="form-group">
                  <label htmlFor="tx-amount">Betrag *</label>
                  <input
                    id="tx-amount"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formData.amount}
                    onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="tx-type">Typ</label>
                  <select
                    id="tx-type"
                    value={formData.transaction_type}
                    onChange={e => setFormData(d => ({ ...d, transaction_type: e.target.value as TransactionType }))}
                  >
                    {(Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[]).map(t => (
                      <option key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row two-col">
                <div className="form-group">
                  <label htmlFor="tx-payee">Empfänger</label>
                  <input
                    id="tx-payee"
                    type="text"
                    placeholder="z.B. REWE, Amazon..."
                    value={formData.payee}
                    onChange={e => setFormData(d => ({ ...d, payee: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="tx-category">Kategorie</label>
                  <select
                    id="tx-category"
                    value={formData.category}
                    onChange={e => setFormData(d => ({ ...d, category: e.target.value }))}
                  >
                    <option value="">-- Kategorie --</option>
                    {DEFAULT_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row two-col">
                <div className="form-group">
                  <label htmlFor="tx-date">Datum</label>
                  <input
                    id="tx-date"
                    type="date"
                    value={formData.transaction_date}
                    onChange={e => setFormData(d => ({ ...d, transaction_date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="tx-account">Konto</label>
                  <select
                    id="tx-account"
                    value={formData.account_id}
                    onChange={e => setFormData(d => ({ ...d, account_id: e.target.value }))}
                  >
                    <option value="">-- Kein Konto --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Beschreibung</label>
                  <input
                    type="text"
                    placeholder="Optional..."
                    value={formData.description}
                    onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="contact-form-actions">
                <button className="btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
                <button className="btn-primary" onClick={handleSubmit} disabled={!formData.amount}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
