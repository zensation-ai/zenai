/**
 * ContextRulesPanel - Kontext-Regeln verwalten
 *
 * Zeigt alle Context Rules mit CRUD-Operationen und Performance-Statistiken.
 * Wird als Tab in SettingsDashboard eingebettet.
 */

import { useState, useEffect, useCallback } from 'react';
import { AIContext } from './ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import './ContextRulesPanel.css';

// ─── Types ──────────────────────────────────────────────

interface DataSource {
  type: 'db_query' | 'memory_layer' | 'rag' | 'static';
  table?: string;
  query?: string;
  layer?: string;
  strategy?: string;
  content?: string;
  limit?: number;
}

interface ContextCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'regex';
  value: string | number;
}

interface ContextRule {
  id: string;
  context: string;
  name: string;
  description: string | null;
  domain: string;
  priority: number;
  conditions: ContextCondition[];
  dataSources: DataSource[];
  contextTemplate: string | null;
  tokenBudget: number;
  isActive: boolean;
  version: number;
}

interface PerformanceStat {
  ruleId: string;
  avgTokens: number;
  avgRetrievalTime: number;
  totalExecutions: number;
  avgSatisfaction: number | null;
}

type SubView = 'rules' | 'performance';

interface ContextRulesPanelProps {
  context: AIContext;
}

const DOMAINS = ['finance', 'email', 'code', 'learning', 'general'] as const;
const DOMAIN_LABELS: Record<string, string> = {
  finance: 'Finanzen',
  email: 'E-Mail',
  code: 'Code',
  learning: 'Lernen',
  general: 'Allgemein',
};

const DS_TYPE_LABELS: Record<string, string> = {
  db_query: 'Datenbank',
  memory_layer: 'Memory',
  rag: 'RAG',
  static: 'Statisch',
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: '=',
  contains: 'enthaelt',
  gt: '>',
  lt: '<',
  regex: 'regex',
};

// ─── API Helper ─────────────────────────────────────────

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...getApiFetchHeaders('application/json'),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Empty Form State ───────────────────────────────────

function emptyFormState(): Omit<ContextRule, 'id' | 'context' | 'version'> {
  return {
    name: '',
    description: null,
    domain: 'general',
    priority: 50,
    conditions: [],
    dataSources: [{ type: 'rag' }],
    contextTemplate: null,
    tokenBudget: 2000,
    isActive: true,
  };
}

// ─── Rule Form Modal ────────────────────────────────────

function RuleFormModal({
  rule,
  onSave,
  onCancel,
  saving,
}: {
  rule: Omit<ContextRule, 'id' | 'context' | 'version'> & { id?: string };
  onSave: (data: Omit<ContextRule, 'id' | 'context' | 'version'>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(rule);

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const addDataSource = () => {
    setForm(prev => ({
      ...prev,
      dataSources: [...prev.dataSources, { type: 'rag' as const }],
    }));
  };

  const removeDataSource = (idx: number) => {
    setForm(prev => ({
      ...prev,
      dataSources: prev.dataSources.filter((_, i) => i !== idx),
    }));
  };

  const updateDataSource = (idx: number, key: string, value: string | number) => {
    setForm(prev => ({
      ...prev,
      dataSources: prev.dataSources.map((ds, i) =>
        i === idx ? { ...ds, [key]: value } : ds
      ),
    }));
  };

  const addCondition = () => {
    setForm(prev => ({
      ...prev,
      conditions: [...prev.conditions, { field: '', operator: 'equals' as const, value: '' }],
    }));
  };

  const removeCondition = (idx: number) => {
    setForm(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== idx),
    }));
  };

  const updateCondition = (idx: number, key: string, value: string) => {
    setForm(prev => ({
      ...prev,
      conditions: prev.conditions.map((c, i) =>
        i === idx ? { ...c, [key]: value } : c
      ),
    }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (form.dataSources.length === 0) return;
    onSave({
      name: form.name.trim(),
      description: form.description?.trim() || null,
      domain: form.domain,
      priority: form.priority,
      conditions: form.conditions.filter(c => c.field.trim()),
      dataSources: form.dataSources,
      contextTemplate: form.contextTemplate?.trim() || null,
      tokenBudget: form.tokenBudget,
      isActive: form.isActive,
    });
  };

  return (
    <div className="ctx-rules-modal-overlay" onClick={onCancel}>
      <div className="ctx-rules-modal" onClick={e => e.stopPropagation()}>
        <h3>{rule.id ? 'Regel bearbeiten' : 'Neue Regel erstellen'}</h3>
        <div className="ctx-rules-form">
          {/* Name */}
          <div className="ctx-rules-form-group">
            <label className="ctx-rules-form-label">Name *</label>
            <input
              className="ctx-rules-input"
              value={form.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="z.B. Finanz-Kontext laden"
            />
          </div>

          {/* Description */}
          <div className="ctx-rules-form-group">
            <label className="ctx-rules-form-label">Beschreibung</label>
            <textarea
              className="ctx-rules-textarea"
              value={form.description || ''}
              onChange={e => updateField('description', e.target.value || null)}
              placeholder="Optionale Beschreibung der Regel"
            />
          </div>

          {/* Domain + Priority */}
          <div className="ctx-rules-form-row">
            <div className="ctx-rules-form-group">
              <label className="ctx-rules-form-label">Domain *</label>
              <select
                className="ctx-rules-select"
                value={form.domain}
                onChange={e => updateField('domain', e.target.value)}
              >
                {DOMAINS.map(d => (
                  <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div className="ctx-rules-form-group">
              <label className="ctx-rules-form-label">Prioritaet (1-100)</label>
              <input
                className="ctx-rules-input"
                type="number"
                min={1}
                max={100}
                value={form.priority}
                onChange={e => updateField('priority', parseInt(e.target.value) || 50)}
              />
            </div>
          </div>

          {/* Token Budget + Active */}
          <div className="ctx-rules-form-row">
            <div className="ctx-rules-form-group">
              <label className="ctx-rules-form-label">Token-Budget</label>
              <input
                className="ctx-rules-input"
                type="number"
                min={100}
                max={10000}
                step={100}
                value={form.tokenBudget}
                onChange={e => updateField('tokenBudget', parseInt(e.target.value) || 2000)}
              />
            </div>
            <div className="ctx-rules-form-group">
              <label className="ctx-rules-form-label">Status</label>
              <select
                className="ctx-rules-select"
                value={form.isActive ? 'active' : 'inactive'}
                onChange={e => updateField('isActive', e.target.value === 'active')}
              >
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </select>
            </div>
          </div>

          {/* Data Sources */}
          <div className="ctx-rules-form-group">
            <div className="ctx-rules-ds-header">
              <label className="ctx-rules-form-label">Datenquellen *</label>
              <button type="button" className="ctx-rules-ds-add" onClick={addDataSource}>
                + Quelle
              </button>
            </div>
            <div className="ctx-rules-ds-list">
              {form.dataSources.map((ds, idx) => (
                <div key={idx} className="ctx-rules-ds-item">
                  <select
                    className="ctx-rules-select"
                    value={ds.type}
                    onChange={e => updateDataSource(idx, 'type', e.target.value)}
                    style={{ maxWidth: '120px' }}
                  >
                    <option value="db_query">Datenbank</option>
                    <option value="memory_layer">Memory</option>
                    <option value="rag">RAG</option>
                    <option value="static">Statisch</option>
                  </select>
                  {ds.type === 'db_query' && (
                    <input
                      className="ctx-rules-input"
                      placeholder="Tabelle / Query"
                      value={ds.table || ds.query || ''}
                      onChange={e => updateDataSource(idx, 'table', e.target.value)}
                    />
                  )}
                  {ds.type === 'memory_layer' && (
                    <input
                      className="ctx-rules-input"
                      placeholder="Layer (z.B. working, episodic)"
                      value={ds.layer || ''}
                      onChange={e => updateDataSource(idx, 'layer', e.target.value)}
                    />
                  )}
                  {ds.type === 'rag' && (
                    <input
                      className="ctx-rules-input"
                      placeholder="Strategie (optional)"
                      value={ds.strategy || ''}
                      onChange={e => updateDataSource(idx, 'strategy', e.target.value)}
                    />
                  )}
                  {ds.type === 'static' && (
                    <input
                      className="ctx-rules-input"
                      placeholder="Statischer Inhalt"
                      value={ds.content || ''}
                      onChange={e => updateDataSource(idx, 'content', e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    className="ctx-rules-ds-remove"
                    onClick={() => removeDataSource(idx)}
                    title="Entfernen"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Conditions */}
          <div className="ctx-rules-form-group">
            <div className="ctx-rules-ds-header">
              <label className="ctx-rules-form-label">Bedingungen (optional)</label>
              <button type="button" className="ctx-rules-ds-add" onClick={addCondition}>
                + Bedingung
              </button>
            </div>
            {form.conditions.length > 0 && (
              <div className="ctx-rules-ds-list">
                {form.conditions.map((cond, idx) => (
                  <div key={idx} className="ctx-rules-ds-item">
                    <input
                      className="ctx-rules-input"
                      placeholder="Feld"
                      value={cond.field}
                      onChange={e => updateCondition(idx, 'field', e.target.value)}
                      style={{ maxWidth: '120px' }}
                    />
                    <select
                      className="ctx-rules-select"
                      value={cond.operator}
                      onChange={e => updateCondition(idx, 'operator', e.target.value)}
                      style={{ maxWidth: '100px' }}
                    >
                      <option value="equals">=</option>
                      <option value="contains">enthaelt</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="regex">regex</option>
                    </select>
                    <input
                      className="ctx-rules-input"
                      placeholder="Wert"
                      value={String(cond.value)}
                      onChange={e => updateCondition(idx, 'value', e.target.value)}
                    />
                    <button
                      type="button"
                      className="ctx-rules-ds-remove"
                      onClick={() => removeCondition(idx)}
                      title="Entfernen"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="ctx-rules-form-actions">
            <button type="button" className="ctx-rules-btn ctx-rules-btn-cancel" onClick={onCancel}>
              Abbrechen
            </button>
            <button
              type="button"
              className="ctx-rules-btn ctx-rules-btn-save"
              onClick={handleSubmit}
              disabled={saving || !form.name.trim() || form.dataSources.length === 0}
            >
              {saving ? 'Wird gespeichert...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Performance View ───────────────────────────────────

function PerformanceView({ context, rules }: { context: AIContext; rules: ContextRule[] }) {
  const [stats, setStats] = useState<PerformanceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await apiCall<{ data: PerformanceStat[] }>(
          `/api/${context}/context-rules/performance`
        );
        setStats(data.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [context]);

  const getRuleName = (ruleId: string): string => {
    const rule = rules.find(r => r.id === ruleId);
    return rule?.name || ruleId.slice(0, 8) + '...';
  };

  if (loading) {
    return <div className="ctx-rules-perf-empty">Lade Performance-Daten...</div>;
  }

  if (error) {
    return <div className="ctx-rules-error">{error}</div>;
  }

  if (stats.length === 0) {
    return (
      <div className="ctx-rules-perf-empty">
        Noch keine Performance-Daten vorhanden. Regeln muessen zuerst ausgefuehrt werden.
      </div>
    );
  }

  return (
    <div className="ctx-rules-perf-grid">
      {stats.map(stat => (
        <div key={stat.ruleId} className="ctx-rules-perf-card">
          <div className="ctx-rules-perf-card-title">{getRuleName(stat.ruleId)}</div>
          <div className="ctx-rules-perf-stats">
            <div className="ctx-rules-perf-stat">
              <span className="ctx-rules-perf-stat-label">Ausfuehrungen</span>
              <span className="ctx-rules-perf-stat-value">{stat.totalExecutions}</span>
            </div>
            <div className="ctx-rules-perf-stat">
              <span className="ctx-rules-perf-stat-label">Avg. Tokens</span>
              <span className="ctx-rules-perf-stat-value">{Math.round(stat.avgTokens)}</span>
            </div>
            <div className="ctx-rules-perf-stat">
              <span className="ctx-rules-perf-stat-label">Avg. Latenz</span>
              <span className="ctx-rules-perf-stat-value">{Math.round(stat.avgRetrievalTime)} ms</span>
            </div>
            {stat.avgSatisfaction != null && (
              <div className="ctx-rules-perf-stat">
                <span className="ctx-rules-perf-stat-label">Zufriedenheit</span>
                <span className="ctx-rules-perf-stat-value">{stat.avgSatisfaction.toFixed(1)} / 5</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────

export function ContextRulesPanel({ context }: ContextRulesPanelProps) {
  const [view, setView] = useState<SubView>('rules');
  const [rules, setRules] = useState<ContextRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<(Omit<ContextRule, 'id' | 'context' | 'version'> & { id?: string }) | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall<{ data: ContextRule[] }>(`/api/${context}/context-rules`);
      setRules(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { loadRules(); }, [loadRules]);

  // ─── Create / Update ─────────────────────

  const handleSave = async (formData: Omit<ContextRule, 'id' | 'context' | 'version'>) => {
    setSaving(true);
    try {
      if (editingRule?.id) {
        await apiCall(`/api/${context}/context-rules/${editingRule.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiCall(`/api/${context}/context-rules`, {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      setEditingRule(null);
      await loadRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle Active ───────────────────────

  const handleToggleActive = async (rule: ContextRule) => {
    try {
      await apiCall(`/api/${context}/context-rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      setRules(prev => prev.map(r =>
        r.id === rule.id ? { ...r, isActive: !r.isActive } : r
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Aendern');
    }
  };

  // ─── Delete ──────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      await apiCall(`/api/${context}/context-rules/${id}`, { method: 'DELETE' });
      setDeletingId(null);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Loeschen');
    }
  };

  // ─── Render ──────────────────────────────

  return (
    <div className="ctx-rules-panel">
      {/* View Toggle */}
      <div className="ctx-rules-view-toggle">
        <button
          type="button"
          className={`ctx-rules-toggle-btn ${view === 'rules' ? 'active' : ''}`}
          onClick={() => setView('rules')}
        >
          Regeln
        </button>
        <button
          type="button"
          className={`ctx-rules-toggle-btn ${view === 'performance' ? 'active' : ''}`}
          onClick={() => setView('performance')}
        >
          Performance
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="ctx-rules-error">
          <span>{error}</span>
          <button type="button" className="ctx-rules-btn ctx-rules-btn-edit" onClick={loadRules}>
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Rules View */}
      {view === 'rules' && (
        <>
          <div className="ctx-rules-header">
            <h3>Kontext-Regeln ({rules.length})</h3>
            <button
              type="button"
              className="ctx-rules-btn ctx-rules-btn-create"
              onClick={() => setEditingRule(emptyFormState())}
            >
              + Neue Regel
            </button>
          </div>

          {loading ? (
            <div className="ctx-rules-perf-empty">Lade Regeln...</div>
          ) : rules.length === 0 ? (
            <div className="ctx-rules-empty">
              <span className="ctx-rules-empty-icon">&#9881;</span>
              <p>Keine Kontext-Regeln</p>
              <span className="ctx-rules-empty-sub">
                Erstelle Regeln um den KI-Kontext pro Domain zu steuern.
              </span>
            </div>
          ) : (
            <div className="ctx-rules-list">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  className={`ctx-rules-card ${rule.isActive ? '' : 'ctx-rules-card-inactive'}`}
                >
                  <div className="ctx-rules-card-header">
                    <span className="ctx-rules-card-name">{rule.name}</span>
                    <span className={`ctx-rules-domain-badge ctx-rules-domain-${rule.domain}`}>
                      {DOMAIN_LABELS[rule.domain] || rule.domain}
                    </span>
                    <span className="ctx-rules-priority-badge">P{rule.priority}</span>
                    <span className={`ctx-rules-active-badge ${rule.isActive ? 'active' : 'inactive'}`}>
                      {rule.isActive ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>

                  {rule.description && (
                    <div className="ctx-rules-card-desc">{rule.description}</div>
                  )}

                  <div className="ctx-rules-card-meta">
                    <span>
                      {rule.dataSources.length} Quelle{rule.dataSources.length !== 1 ? 'n' : ''}
                      {' '}({rule.dataSources.map(ds => DS_TYPE_LABELS[ds.type] || ds.type).join(', ')})
                    </span>
                    <span>Token-Budget: {rule.tokenBudget}</span>
                    {rule.conditions.length > 0 && (
                      <span>
                        {rule.conditions.length} Bedingung{rule.conditions.length !== 1 ? 'en' : ''}
                        {' '}({rule.conditions.map(c => `${c.field} ${OPERATOR_LABELS[c.operator]} ${c.value}`).join(', ')})
                      </span>
                    )}
                    <span>v{rule.version}</span>
                  </div>

                  <div className="ctx-rules-card-actions">
                    <button
                      type="button"
                      className="ctx-rules-btn ctx-rules-btn-edit"
                      onClick={() => setEditingRule({ ...rule })}
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="ctx-rules-btn ctx-rules-btn-toggle"
                      onClick={() => handleToggleActive(rule)}
                    >
                      {rule.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button
                      type="button"
                      className="ctx-rules-btn ctx-rules-btn-delete"
                      onClick={() => setDeletingId(rule.id)}
                    >
                      Loeschen
                    </button>
                  </div>

                  {/* Delete Confirmation */}
                  {deletingId === rule.id && (
                    <div className="ctx-rules-confirm-delete">
                      <span>Regel &quot;{rule.name}&quot; wirklich loeschen?</span>
                      <div className="ctx-rules-confirm-actions">
                        <button
                          type="button"
                          className="ctx-rules-btn ctx-rules-btn-cancel"
                          onClick={() => setDeletingId(null)}
                        >
                          Abbrechen
                        </button>
                        <button
                          type="button"
                          className="ctx-rules-btn ctx-rules-btn-delete"
                          onClick={() => handleDelete(rule.id)}
                        >
                          Endgueltig loeschen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Performance View */}
      {view === 'performance' && (
        <PerformanceView context={context} rules={rules} />
      )}

      {/* Edit/Create Modal */}
      {editingRule && (
        <RuleFormModal
          rule={editingRule}
          onSave={handleSave}
          onCancel={() => setEditingRule(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
