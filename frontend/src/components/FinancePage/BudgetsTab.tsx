/**
 * Budgets Tab - Phase 4
 */

import { useState, useCallback } from 'react';
import type { Budget, BudgetPeriod } from './types';
import { BUDGET_PERIOD_LABELS, DEFAULT_CATEGORIES } from './types';
import { useEscapeKey } from '../../hooks/useClickOutside';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAnnounce } from '../../hooks/useAnnounce';
import { useConfirm } from '../ConfirmDialog';

interface BudgetsTabProps {
  budgets: Budget[];
  onCreate: (data: Partial<Budget>) => Promise<void>;
  onUpdate: (id: string, data: Partial<Budget>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function BudgetsTab({ budgets, onCreate, onDelete }: BudgetsTabProps) {
  const [showForm, setShowForm] = useState(false);
  useEscapeKey(() => setShowForm(false), showForm);
  const focusTrapRef = useFocusTrap<HTMLDivElement>({ isActive: showForm });
  const announce = useAnnounce();
  const [formData, setFormData] = useState({
    name: '', category: '', amount_limit: '', period: 'monthly' as BudgetPeriod, alert_threshold: '80',
  });

  const handleSubmit = useCallback(async () => {
    if (!formData.name || !formData.category || !formData.amount_limit) return;
    await onCreate({
      name: formData.name,
      category: formData.category,
      amount_limit: parseFloat(formData.amount_limit),
      period: formData.period,
      alert_threshold: parseFloat(formData.alert_threshold) / 100,
    });
    announce('Budget erstellt');
    setShowForm(false);
    setFormData({ name: '', category: '', amount_limit: '', period: 'monthly', alert_threshold: '80' });
  }, [formData, onCreate, announce]);

  const confirm = useConfirm();

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirm({ title: 'Löschen', message: 'Budget wirklich löschen?', confirmText: 'Löschen', variant: 'danger' });
    if (!confirmed) return;
    await onDelete(id);
    announce('Budget gelöscht', 'assertive');
  }, [onDelete, confirm, announce]);

  return (
    <div className="budgets-tab">
      <div className="finance-toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Budget</button>
      </div>

      <div className="budget-list">
        {budgets.map(budget => {
          const percent = budget.usage_percent || 0;
          const isWarning = percent >= (Number(budget.alert_threshold) || 0.8) * 100;
          const isOver = percent >= 100;
          return (
            <div key={budget.id} className={`budget-card ${isOver ? 'over' : isWarning ? 'warning' : ''}`}>
              <div className="budget-header">
                <div>
                  <span className="budget-name">{budget.name}</span>
                  <span className="budget-category">{budget.category} · {BUDGET_PERIOD_LABELS[budget.period]}</span>
                </div>
                <button className="contact-action-btn danger" onClick={() => handleDelete(budget.id)} title="Löschen">✕</button>
              </div>
              <div className="budget-progress">
                <div className="budget-bar-track">
                  <div
                    className={`budget-bar-fill ${isOver ? 'over' : isWarning ? 'warning' : ''}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
                <div className="budget-amounts">
                  <span>{formatCurrency(budget.current_spent)}</span>
                  <span>von {formatCurrency(budget.amount_limit)}</span>
                </div>
              </div>
              <span className="budget-percent">{percent}%</span>
            </div>
          );
        })}
        {budgets.length === 0 && (
          <div className="finance-empty">
            <span className="finance-empty-icon">📊</span>
            <p>Keine Budgets</p>
            <p className="finance-empty-sub">Setze Limits für deine Ausgaben-Kategorien</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="contact-form-overlay" onClick={() => setShowForm(false)} role="presentation">
          <div ref={focusTrapRef} className="contact-form-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Neues Budget">
            <div className="contact-form-header">
              <h2>Neues Budget</h2>
              <button className="contact-form-close" onClick={() => setShowForm(false)} aria-label="Schliessen">✕</button>
            </div>
            <div className="contact-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="budget-name">Name *</label>
                  <input
                    id="budget-name"
                    type="text"
                    placeholder="z.B. Restaurant-Budget"
                    value={formData.name}
                    onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-row two-col">
                <div className="form-group">
                  <label htmlFor="budget-category">Kategorie *</label>
                  <select
                    id="budget-category"
                    value={formData.category}
                    onChange={e => setFormData(d => ({ ...d, category: e.target.value }))}
                  >
                    <option value="">-- Kategorie --</option>
                    {DEFAULT_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="budget-limit">Limit *</label>
                  <input
                    id="budget-limit"
                    type="number"
                    step="0.01"
                    placeholder="z.B. 200"
                    value={formData.amount_limit}
                    onChange={e => setFormData(d => ({ ...d, amount_limit: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-row two-col">
                <div className="form-group">
                  <label htmlFor="budget-period">Zeitraum</label>
                  <select
                    id="budget-period"
                    value={formData.period}
                    onChange={e => setFormData(d => ({ ...d, period: e.target.value as BudgetPeriod }))}
                  >
                    {(Object.keys(BUDGET_PERIOD_LABELS) as BudgetPeriod[]).map(p => (
                      <option key={p} value={p}>{BUDGET_PERIOD_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="budget-threshold">Warnung bei (%)</label>
                  <input
                    id="budget-threshold"
                    type="number"
                    min="1"
                    max="100"
                    value={formData.alert_threshold}
                    onChange={e => setFormData(d => ({ ...d, alert_threshold: e.target.value }))}
                  />
                </div>
              </div>
              <div className="contact-form-actions">
                <button className="btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={!formData.name || !formData.category || !formData.amount_limit}
                >Erstellen</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
