/**
 * Financial Goals Tab - Phase 4
 */

import { useState, useCallback } from 'react';
import type { FinancialGoal, GoalPriority } from './types';
import { GOAL_PRIORITY_LABELS } from './types';
import { useEscapeKey } from '../../hooks/useClickOutside';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAnnounce } from '../../hooks/useAnnounce';
import { useConfirm } from '../ConfirmDialog';

interface GoalsTabProps {
  goals: FinancialGoal[];
  onCreate: (data: Partial<FinancialGoal>) => Promise<void>;
  onUpdate: (id: string, data: Partial<FinancialGoal>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function GoalsTab({ goals, onCreate, onUpdate, onDelete }: GoalsTabProps) {
  const [showForm, setShowForm] = useState(false);
  useEscapeKey(() => setShowForm(false), showForm);
  const focusTrapRef = useFocusTrap<HTMLDivElement>({ isActive: showForm });
  const announce = useAnnounce();
  const [formData, setFormData] = useState({
    name: '', target_amount: '', current_amount: '0', deadline: '', category: '', priority: 'medium' as GoalPriority,
  });

  const handleSubmit = useCallback(async () => {
    if (!formData.name || !formData.target_amount) return;
    await onCreate({
      name: formData.name,
      target_amount: parseFloat(formData.target_amount),
      current_amount: parseFloat(formData.current_amount) || 0,
      deadline: formData.deadline || undefined,
      category: formData.category || undefined,
      priority: formData.priority,
    } as Partial<FinancialGoal>);
    announce('Sparziel erstellt');
    setShowForm(false);
    setFormData({ name: '', target_amount: '', current_amount: '0', deadline: '', category: '', priority: 'medium' });
  }, [formData, onCreate]);

  const handleToggleComplete = useCallback(async (goal: FinancialGoal) => {
    await onUpdate(goal.id, { is_completed: !goal.is_completed });
  }, [onUpdate]);

  const confirm = useConfirm();

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirm({ title: 'Löschen', message: 'Sparziel wirklich löschen?', confirmText: 'Löschen', variant: 'danger' });
    if (!confirmed) return;
    await onDelete(id);
    announce('Sparziel gelöscht', 'assertive');
  }, [onDelete, confirm, announce]);

  const activeGoals = goals.filter(g => !g.is_completed);
  const completedGoals = goals.filter(g => g.is_completed);

  return (
    <div className="goals-tab">
      <div className="finance-toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Sparziel</button>
      </div>

      {/* Active Goals */}
      <div className="goal-list">
        {activeGoals.map(goal => {
          const percent = goal.progress_percent || 0;
          const daysLeft = goal.deadline
            ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;
          return (
            <div key={goal.id} className="goal-card">
              <div className="goal-header">
                <div>
                  <span className="goal-name">{goal.name}</span>
                  <span className="goal-meta">
                    {goal.category && <span>{goal.category}</span>}
                    <span className={`goal-priority ${goal.priority}`}>{GOAL_PRIORITY_LABELS[goal.priority]}</span>
                    {daysLeft !== null && (
                      <span className={daysLeft < 0 ? 'overdue' : ''}>
                        {daysLeft < 0 ? `${Math.abs(daysLeft)} Tage überfällig` : `${daysLeft} Tage`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="goal-actions">
                  <button className="contact-action-btn" onClick={() => handleToggleComplete(goal)} title="Abschließen" aria-label="Ziel abschliessen">✓</button>
                  <button className="contact-action-btn danger" onClick={() => handleDelete(goal.id)} title="Löschen" aria-label="Ziel loeschen">✕</button>
                </div>
              </div>
              <div className="goal-progress">
                <div className="budget-bar-track">
                  <div className="budget-bar-fill goal-fill" style={{ width: `${Math.min(100, percent)}%` }} />
                </div>
                <div className="budget-amounts">
                  <span>{formatCurrency(goal.current_amount)}</span>
                  <span>von {formatCurrency(goal.target_amount)} ({percent}%)</span>
                </div>
              </div>
            </div>
          );
        })}
        {activeGoals.length === 0 && (
          <div className="finance-empty">
            <span className="finance-empty-icon">🎯</span>
            <p>Keine aktiven Sparziele</p>
            <p className="finance-empty-sub">Setze dir ein finanzielles Ziel</p>
          </div>
        )}
      </div>

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className="completed-goals">
          <h3>Erreichte Ziele ({completedGoals.length})</h3>
          {completedGoals.map(goal => (
            <div key={goal.id} className="goal-card completed">
              <span className="goal-name">{goal.name} ✅</span>
              <span className="goal-meta">{formatCurrency(goal.target_amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="contact-form-overlay" onClick={() => setShowForm(false)} role="presentation">
          <div ref={focusTrapRef} className="contact-form-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Neues Sparziel">
            <div className="contact-form-header">
              <h2>Neues Sparziel</h2>
              <button className="contact-form-close" onClick={() => setShowForm(false)} aria-label="Schliessen">✕</button>
            </div>
            <div className="contact-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="goal-name">Name *</label>
                  <input
                    id="goal-name"
                    type="text"
                    placeholder="z.B. Urlaub, Notgroschen..."
                    value={formData.name}
                    onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-row two-col">
                <div className="form-group">
                  <label htmlFor="goal-target">Zielbetrag *</label>
                  <input
                    id="goal-target"
                    type="number"
                    step="0.01"
                    placeholder="z.B. 5000"
                    value={formData.target_amount}
                    onChange={e => setFormData(d => ({ ...d, target_amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="goal-current">Aktueller Stand</label>
                  <input
                    id="goal-current"
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={formData.current_amount}
                    onChange={e => setFormData(d => ({ ...d, current_amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-row two-col">
                <div className="form-group">
                  <label htmlFor="goal-deadline">Deadline</label>
                  <input
                    id="goal-deadline"
                    type="date"
                    value={formData.deadline}
                    onChange={e => setFormData(d => ({ ...d, deadline: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="goal-priority">Priorität</label>
                  <select
                    id="goal-priority"
                    value={formData.priority}
                    onChange={e => setFormData(d => ({ ...d, priority: e.target.value as GoalPriority }))}
                  >
                    {(Object.keys(GOAL_PRIORITY_LABELS) as GoalPriority[]).map(p => (
                      <option key={p} value={p}>{GOAL_PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="contact-form-actions">
                <button className="btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={!formData.name || !formData.target_amount}
                >Erstellen</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
