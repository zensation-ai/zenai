import { useState } from 'react';
import { ProductivityGoals, categoryLabels } from './DigestTypes';

interface DigestGoalsProps {
  goals: ProductivityGoals | null;
  savingGoals: boolean;
  onSaveGoals: (form: GoalFormState) => void;
}

export interface GoalFormState {
  daily_ideas_target: number;
  weekly_ideas_target: number;
  daily_tasks_target: number;
  weekly_tasks_target: number;
  focus_categories: string[];
  reminder_time: string;
}

export function DigestGoals({ goals, savingGoals, onSaveGoals }: DigestGoalsProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GoalFormState>({
    daily_ideas_target: goals?.daily_ideas_target || 3,
    weekly_ideas_target: goals?.weekly_ideas_target || 15,
    daily_tasks_target: goals?.daily_tasks_target || 5,
    weekly_tasks_target: goals?.weekly_tasks_target || 20,
    focus_categories: goals?.focus_categories || [],
    reminder_time: goals?.reminder_time || '',
  });

  const toggleFocusCategory = (category: string) => {
    setForm(prev => ({
      ...prev,
      focus_categories: prev.focus_categories.includes(category)
        ? prev.focus_categories.filter(c => c !== category)
        : [...prev.focus_categories, category],
    }));
  };

  const handleSave = () => {
    onSaveGoals(form);
    setEditing(false);
  };

  return (
    <div className="goals-section liquid-glass neuro-stagger-item">
      <div className="section-header-row">
        <h2>🎯 Produktivitatsziele</h2>
        <button
          type="button"
          className={`edit-btn neuro-hover-lift ${editing ? 'active' : ''}`}
          onClick={() => setEditing(!editing)}
          aria-label={editing ? 'Bearbeitung abbrechen' : 'Ziele bearbeiten'}
        >
          {editing ? '✕ Abbrechen' : '✏️ Bearbeiten'}
        </button>
      </div>

      {editing ? (
        <div className="goals-form">
          <div className="goals-grid">
            <div className="goal-input-group">
              <label>Ideen pro Tag</label>
              <input type="number" min="0" value={form.daily_ideas_target} onChange={(e) => setForm({ ...form, daily_ideas_target: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="goal-input-group">
              <label>Ideen pro Woche</label>
              <input type="number" min="0" value={form.weekly_ideas_target} onChange={(e) => setForm({ ...form, weekly_ideas_target: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="goal-input-group">
              <label>Aufgaben pro Tag</label>
              <input type="number" min="0" value={form.daily_tasks_target} onChange={(e) => setForm({ ...form, daily_tasks_target: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="goal-input-group">
              <label>Aufgaben pro Woche</label>
              <input type="number" min="0" value={form.weekly_tasks_target} onChange={(e) => setForm({ ...form, weekly_tasks_target: parseInt(e.target.value, 10) || 0 })} />
            </div>
          </div>

          <div className="focus-categories-section">
            <label>Fokus-Kategorien</label>
            <div className="category-toggles">
              {Object.entries(categoryLabels).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={`category-toggle neuro-hover-lift ${form.focus_categories.includes(key) ? 'active' : ''}`}
                  onClick={() => toggleFocusCategory(key)}
                  aria-label={`Kategorie ${label} ${form.focus_categories.includes(key) ? 'entfernen' : 'hinzufugen'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="goal-input-group">
            <label>Erinnerungszeit (optional)</label>
            <input type="time" value={form.reminder_time} onChange={(e) => setForm({ ...form, reminder_time: e.target.value })} />
          </div>

          <div className="form-actions">
            <button type="button" className="save-btn neuro-button" onClick={handleSave} disabled={savingGoals} aria-label="Ziele speichern">
              {savingGoals ? 'Speichern...' : '💾 Speichern'}
            </button>
          </div>
        </div>
      ) : (
        <div className="goals-display">
          <div className="goals-cards">
            <div className="goal-card">
              <span className="goal-icon">📅</span>
              <div className="goal-content">
                <span className="goal-title">Täglich</span>
                <div className="goal-targets">
                  <span>💡 {goals?.daily_ideas_target || 3} Ideen</span>
                  <span>✅ {goals?.daily_tasks_target || 5} Aufgaben</span>
                </div>
              </div>
            </div>
            <div className="goal-card">
              <span className="goal-icon">📆</span>
              <div className="goal-content">
                <span className="goal-title">Wöchentlich</span>
                <div className="goal-targets">
                  <span>💡 {goals?.weekly_ideas_target || 15} Ideen</span>
                  <span>✅ {goals?.weekly_tasks_target || 20} Aufgaben</span>
                </div>
              </div>
            </div>
          </div>

          {goals?.focus_categories && goals.focus_categories.length > 0 && (
            <div className="focus-display">
              <h3>🎯 Fokus-Kategorien</h3>
              <div className="focus-tags">
                {goals.focus_categories.map(cat => (
                  <span key={cat} className="focus-tag">{categoryLabels[cat] || cat}</span>
                ))}
              </div>
            </div>
          )}

          {goals?.reminder_time && (
            <div className="reminder-display">
              <span className="reminder-icon">⏰</span>
              <span>Tägliche Erinnerung um {goals.reminder_time} Uhr</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
