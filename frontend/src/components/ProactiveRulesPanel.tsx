/**
 * ProactiveRulesPanel - Proaktive Regeln verwalten
 *
 * CRUD UI for proactive engine rules.
 * Lists rules with event type, decision type, priority, active status.
 * Create/Edit via modal form. Shows event stats at top.
 */

import { useState, useEffect, useCallback } from 'react';
import { AIContext } from './ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import './ProactiveRulesPanel.css';

// ─── Types ───────────────────────────────────────────────

interface ProactiveRule {
  id: string;
  name: string;
  description: string | null;
  eventTypes: string[];
  conditions: unknown[];
  decision: DecisionType;
  actionConfig: Record<string, unknown>;
  riskLevel: string;
  requiresApproval: boolean;
  priority: number;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  isActive: boolean;
  createdAt: string;
}

type DecisionType = 'notify' | 'prepare_context' | 'take_action' | 'trigger_agent';

interface EventStats {
  total: number;
  byType: Record<string, number>;
  byDecision: Record<string, number>;
}

interface RuleFormData {
  name: string;
  description: string;
  eventTypes: string[];
  decision: DecisionType;
  priority: number;
  cooldownMinutes: number;
  requiresApproval: boolean;
  isActive: boolean;
}

// ─── Constants ───────────────────────────────────────────

const EVENT_TYPES = [
  { value: 'task.created', label: 'Aufgabe erstellt' },
  { value: 'task.overdue', label: 'Aufgabe ueberfaellig' },
  { value: 'email.received', label: 'E-Mail empfangen' },
  { value: 'memory.fact_learned', label: 'Fakt gelernt' },
  { value: 'idea.created', label: 'Idee erstellt' },
  { value: 'calendar.event_approaching', label: 'Termin naht' },
  { value: 'agent.completed', label: 'Agent abgeschlossen' },
  { value: 'agent.failed', label: 'Agent fehlgeschlagen' },
  { value: 'system.daily_digest', label: 'Taegl. Zusammenfassung' },
];

const DECISION_OPTIONS: { value: DecisionType; label: string; icon: string; desc: string }[] = [
  { value: 'notify', label: 'Benachrichtigen', icon: '\uD83D\uDD14', desc: 'Zeigt eine Benachrichtigung' },
  { value: 'prepare_context', label: 'Kontext vorbereiten', icon: '\uD83D\uDCCB', desc: 'Bereitet relevante Daten vor' },
  { value: 'take_action', label: 'Aktion ausfuehren', icon: '\u26A1', desc: 'Fuehrt automatische Aktion aus' },
  { value: 'trigger_agent', label: 'Agent starten', icon: '\uD83E\uDD16', desc: 'Startet einen KI-Agenten' },
];

const DECISION_LABELS: Record<string, string> = {
  notify: 'Benachrichtigung',
  prepare_context: 'Kontext',
  take_action: 'Aktion',
  trigger_agent: 'Agent',
};

const EMPTY_FORM: RuleFormData = {
  name: '',
  description: '',
  eventTypes: [],
  decision: 'notify',
  priority: 5,
  cooldownMinutes: 60,
  requiresApproval: false,
  isActive: true,
};

// ─── Helpers ─────────────────────────────────────────────

function eventTypeLabel(type: string): string {
  return EVENT_TYPES.find(e => e.value === type)?.label || type.replace(/\./g, ' ');
}

// ─── Component ───────────────────────────────────────────

interface ProactiveRulesPanelProps {
  context: AIContext;
}

export function ProactiveRulesPanel({ context }: ProactiveRulesPanelProps) {
  const [rules, setRules] = useState<ProactiveRule[]>([]);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ProactiveRule | null>(null);
  const [form, setForm] = useState<RuleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const apiBase = getApiBaseUrl();
  const headers = useCallback(() => getApiFetchHeaders('application/json'), []);

  // ─── Data Loading ────────────────────────────────────

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/${context}/proactive-engine/rules`, { headers: headers() });
      if (!res.ok) throw new Error('Fehler beim Laden der Regeln');
      const data = await res.json();
      setRules(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [apiBase, context, headers]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/${context}/proactive-engine/stats`, { headers: headers() });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.data || null);
    } catch {
      // Stats are non-critical
    }
  }, [apiBase, context, headers]);

  useEffect(() => {
    loadRules();
    loadStats();
  }, [loadRules, loadStats]);

  // ─── Modal Handlers ─────────────────────────────────

  const openCreate = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (rule: ProactiveRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      description: rule.description || '',
      eventTypes: rule.eventTypes,
      decision: rule.decision,
      priority: rule.priority,
      cooldownMinutes: rule.cooldownMinutes,
      requiresApproval: rule.requiresApproval,
      isActive: rule.isActive,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRule(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.eventTypes.length === 0) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        eventTypes: form.eventTypes,
        decision: form.decision,
        priority: form.priority,
        cooldownMinutes: form.cooldownMinutes,
        requiresApproval: form.requiresApproval,
        isActive: form.isActive,
      };

      const url = editingRule
        ? `${apiBase}/api/${context}/proactive-engine/rules/${editingRule.id}`
        : `${apiBase}/api/${context}/proactive-engine/rules`;

      const res = await fetch(url, {
        method: editingRule ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Speichern fehlgeschlagen');
      }

      closeModal();
      loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle Active ──────────────────────────────────

  const toggleActive = async (rule: ProactiveRule) => {
    try {
      const res = await fetch(`${apiBase}/api/${context}/proactive-engine/rules/${rule.id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) throw new Error('Fehler');
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
    } catch {
      setError('Status konnte nicht geaendert werden');
    }
  };

  // ─── Delete ─────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${apiBase}/api/${context}/proactive-engine/rules/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Fehler');
      setDeletingId(null);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      setError('Loeschen fehlgeschlagen');
    }
  };

  // ─── Form Field Handlers ───────────────────────────

  const updateField = <K extends keyof RuleFormData>(key: K, value: RuleFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleEventType = (eventType: string) => {
    setForm(prev => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter(e => e !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  };

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="pr-panel">
      {/* Stats */}
      {stats && (
        <div className="pr-stats">
          <div className="pr-stat-card">
            <div className="pr-stat-value">{stats.total ?? 0}</div>
            <div className="pr-stat-label">Ereignisse gesamt</div>
          </div>
          <div className="pr-stat-card">
            <div className="pr-stat-value">{rules.length}</div>
            <div className="pr-stat-label">Regeln</div>
          </div>
          <div className="pr-stat-card">
            <div className="pr-stat-value">{rules.filter(r => r.isActive).length}</div>
            <div className="pr-stat-label">Aktive Regeln</div>
          </div>
          <div className="pr-stat-card">
            <div className="pr-stat-value">
              {stats.byDecision ? Object.values(stats.byDecision).reduce((a, b) => a + b, 0) : 0}
            </div>
            <div className="pr-stat-label">Entscheidungen</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="pr-header">
        <h3>Proaktive Regeln</h3>
        <button type="button" className="pr-add-btn" onClick={openCreate}>
          + Neue Regel
        </button>
      </div>

      {/* Error */}
      {error && <div className="pr-error">{error}</div>}

      {/* List */}
      {loading ? (
        <div className="pr-loading">Lade Regeln...</div>
      ) : rules.length === 0 ? (
        <div className="pr-empty">
          <span className="pr-empty-icon" aria-hidden="true">{'\uD83D\uDD27'}</span>
          <p>Keine Regeln vorhanden</p>
          <span>Erstelle eine proaktive Regel, um automatisch auf Ereignisse zu reagieren.</span>
        </div>
      ) : (
        <div className="pr-list">
          {rules.map(rule => (
            <div key={rule.id} className={`pr-card ${!rule.isActive ? 'pr-card-inactive' : ''}`}>
              <div className="pr-card-top">
                <div className="pr-card-info">
                  <h4 className="pr-card-name">{rule.name}</h4>
                  {rule.description && <p className="pr-card-desc">{rule.description}</p>}
                </div>
                <div className="pr-card-actions">
                  <button
                    type="button"
                    className="pr-icon-btn"
                    onClick={() => toggleActive(rule)}
                    aria-label={rule.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    title={rule.isActive ? 'Deaktivieren' : 'Aktivieren'}
                  >
                    {rule.isActive ? '\u2714' : '\u25CB'}
                  </button>
                  <button
                    type="button"
                    className="pr-icon-btn"
                    onClick={() => openEdit(rule)}
                    aria-label="Bearbeiten"
                    title="Bearbeiten"
                  >
                    {'\u270E'}
                  </button>
                  <button
                    type="button"
                    className="pr-icon-btn pr-icon-btn-danger"
                    onClick={() => setDeletingId(deletingId === rule.id ? null : rule.id)}
                    aria-label="Loeschen"
                    title="Loeschen"
                  >
                    {'\uD83D\uDDD1'}
                  </button>
                </div>
              </div>

              <div className="pr-card-badges">
                {rule.eventTypes.map(et => (
                  <span key={et} className="pr-badge pr-badge-event">{eventTypeLabel(et)}</span>
                ))}
                <span className={`pr-badge pr-badge-decision pr-badge-${rule.decision}`}>
                  {DECISION_LABELS[rule.decision] || rule.decision}
                </span>
                <span className="pr-badge pr-badge-priority">P{rule.priority}</span>
                {rule.cooldownMinutes > 0 && (
                  <span className="pr-badge pr-badge-cooldown">{rule.cooldownMinutes} Min.</span>
                )}
                {rule.requiresApproval && (
                  <span className="pr-badge pr-badge-approval">Genehmigung</span>
                )}
              </div>

              {/* Delete Confirmation */}
              {deletingId === rule.id && (
                <div className="pr-delete-confirm">
                  <span>Regel &quot;{rule.name}&quot; wirklich loeschen?</span>
                  <button
                    type="button"
                    className="pr-btn-danger"
                    onClick={() => handleDelete(rule.id)}
                  >
                    Loeschen
                  </button>
                  <button
                    type="button"
                    className="pr-btn pr-btn-secondary"
                    onClick={() => setDeletingId(null)}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    Abbrechen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="pr-modal-overlay" onClick={closeModal}>
          <div className="pr-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={editingRule ? 'Regel bearbeiten' : 'Neue Regel erstellen'}>
            <div className="pr-modal-header">
              <h3>{editingRule ? 'Regel bearbeiten' : 'Neue Regel erstellen'}</h3>
              <button type="button" className="pr-modal-close" onClick={closeModal} aria-label="Schliessen">
                &times;
              </button>
            </div>

            <div className="pr-modal-body">
              {/* Name */}
              <div className="pr-field">
                <label className="pr-field-label">Name *</label>
                <input
                  type="text"
                  className="pr-input"
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="z.B. E-Mail-Benachrichtigung"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div className="pr-field">
                <label className="pr-field-label">Beschreibung</label>
                <textarea
                  className="pr-input"
                  value={form.description}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder="Was macht diese Regel?"
                  rows={2}
                />
              </div>

              {/* Event Types */}
              <div className="pr-field">
                <label className="pr-field-label">Ereignistypen *</label>
                <span className="pr-field-hint">Waehle mindestens einen Ereignistyp</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.3rem' }}>
                  {EVENT_TYPES.map(et => (
                    <button
                      key={et.value}
                      type="button"
                      className={`pr-badge ${form.eventTypes.includes(et.value) ? 'pr-badge-decision pr-badge-notify' : 'pr-badge-event'}`}
                      onClick={() => toggleEventType(et.value)}
                      style={{ cursor: 'pointer', padding: '4px 10px', fontSize: '0.72rem' }}
                    >
                      {et.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Decision Type */}
              <div className="pr-field">
                <label className="pr-field-label">Entscheidungstyp</label>
                <div className="pr-decision-grid">
                  {DECISION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`pr-decision-option ${form.decision === opt.value ? `selected-${opt.value}` : ''}`}
                      onClick={() => updateField('decision', opt.value)}
                    >
                      <span className="pr-decision-icon" aria-hidden="true">{opt.icon}</span>
                      <span>{opt.label}</span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.7 }}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority & Cooldown */}
              <div className="pr-row">
                <div className="pr-field">
                  <label className="pr-field-label">Prioritaet (1-10)</label>
                  <input
                    type="number"
                    className="pr-input"
                    value={form.priority}
                    onChange={e => updateField('priority', Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                    min={1}
                    max={10}
                  />
                </div>
                <div className="pr-field">
                  <label className="pr-field-label">Cooldown (Minuten)</label>
                  <input
                    type="number"
                    className="pr-input"
                    value={form.cooldownMinutes}
                    onChange={e => updateField('cooldownMinutes', Math.max(0, parseInt(e.target.value, 10) || 0))}
                    min={0}
                  />
                </div>
              </div>

              {/* Requires Approval */}
              {(form.decision === 'take_action' || form.decision === 'trigger_agent') && (
                <div className="pr-toggle-row">
                  <div>
                    <div className="pr-toggle-label">Genehmigung erforderlich</div>
                    <div className="pr-toggle-desc">Aktion muss vor Ausfuehrung genehmigt werden</div>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={form.requiresApproval}
                      onChange={e => updateField('requiresApproval', e.target.checked)}
                      aria-label="Genehmigung erforderlich"
                    />
                    <span className="settings-toggle-slider" />
                  </label>
                </div>
              )}

              {/* Active */}
              <div className="pr-toggle-row">
                <div>
                  <div className="pr-toggle-label">Regel aktiv</div>
                  <div className="pr-toggle-desc">Deaktivierte Regeln werden nicht ausgefuehrt</div>
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => updateField('isActive', e.target.checked)}
                    aria-label="Regel aktiv"
                  />
                  <span className="settings-toggle-slider" />
                </label>
              </div>
            </div>

            <div className="pr-modal-footer">
              <button type="button" className="pr-btn pr-btn-secondary" onClick={closeModal}>
                Abbrechen
              </button>
              <button
                type="button"
                className="pr-btn pr-btn-primary"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.eventTypes.length === 0}
              >
                {saving ? 'Speichern...' : editingRule ? 'Aktualisieren' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
