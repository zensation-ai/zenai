/**
 * GovernanceDashboard - Governance & Audit Trail
 *
 * 3 Sub-Views:
 * - Pending: Ausstehende Genehmigungen mit Approve/Reject
 * - History: Verlauf aller Governance-Aktionen
 * - Policies: Governance-Richtlinien verwalten
 */

import { useState, useEffect, useCallback } from 'react';
import { AIContext } from './ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import '../neurodesign.css';

interface GovernanceAction {
  id: string;
  context: string;
  action_type: string;
  action_source: string;
  source_id: string | null;
  description: string;
  payload: Record<string, unknown> | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GovernancePolicy {
  id: string;
  context: string;
  name: string;
  description: string | null;
  action_type: string;
  conditions: unknown[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  auto_approve: boolean;
  notify_on_auto_approve: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  context: string;
  event_type: string;
  actor: string;
  target_type: string | null;
  target_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type SubView = 'pending' | 'history' | 'policies';

interface GovernanceDashboardProps {
  context: AIContext;
}

const RISK_COLORS: Record<string, string> = {
  low: '#4ade80',
  medium: '#fbbf24',
  high: '#f97316',
  critical: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  auto_approved: 'Auto-Genehmigt',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  expired: 'Abgelaufen',
  executed: 'Ausgeführt',
  failed: 'Fehlgeschlagen',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

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

// ==========================================
// Pending Actions Sub-View
// ==========================================

function PendingActions({ context }: { context: AIContext }) {
  const [actions, setActions] = useState<GovernanceAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall<{ data: GovernanceAction[] }>(
        `/api/${context}/governance/pending?limit=50`
      );
      setActions(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { loadPending(); }, [loadPending]);

  const handleApprove = async (actionId: string) => {
    setActionInProgress(actionId);
    try {
      await apiCall(`/api/${context}/governance/${actionId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approved_by: 'user' }),
      });
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Genehmigen');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (actionId: string) => {
    const reason = prompt('Ablehnungsgrund:');
    if (!reason) return;
    setActionInProgress(actionId);
    try {
      await apiCall(`/api/${context}/governance/${actionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejected_by: 'user', reason }),
      });
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ablehnen');
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) return <div className="settings-tab-loader">Lade ausstehende Aktionen...</div>;
  if (error) return <div className="settings-error">{error}</div>;

  if (actions.length === 0) {
    return (
      <div className="governance-empty">
        <span className="governance-empty-icon">✓</span>
        <p>Keine ausstehenden Genehmigungen</p>
        <span className="governance-empty-sub">Alle KI-Aktionen sind verarbeitet.</span>
      </div>
    );
  }

  return (
    <div className="governance-list">
      {actions.map((action) => (
        <div key={action.id} className="governance-card">
          <div className="governance-card-header">
            <span
              className="governance-risk-badge"
              style={{ background: RISK_COLORS[action.risk_level] || '#888' }}
            >
              {action.risk_level.toUpperCase()}
            </span>
            <span className="governance-type">{action.action_type}</span>
            <span className="governance-source">von {action.action_source}</span>
          </div>
          <p className="governance-description">{action.description}</p>
          <div className="governance-meta">
            <span>Erstellt: {formatDate(action.created_at)}</span>
            {action.expires_at && <span>Ablauf: {formatDate(action.expires_at)}</span>}
          </div>
          <div className="governance-actions">
            <button
              className="governance-btn governance-btn-approve"
              onClick={() => handleApprove(action.id)}
              disabled={actionInProgress === action.id}
            >
              {actionInProgress === action.id ? '...' : 'Genehmigen'}
            </button>
            <button
              className="governance-btn governance-btn-reject"
              onClick={() => handleReject(action.id)}
              disabled={actionInProgress === action.id}
            >
              Ablehnen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// Action History Sub-View
// ==========================================

function ActionHistory({ context }: { context: AIContext }) {
  const [actions, setActions] = useState<GovernanceAction[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'actions' | 'audit'>('actions');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [actionsData, auditData] = await Promise.all([
          apiCall<{ data: GovernanceAction[] }>(`/api/${context}/governance/history?limit=50`),
          apiCall<{ data: AuditEntry[] }>(`/api/${context}/governance/audit?limit=50&days=30`),
        ]);
        setActions(actionsData.data || []);
        setAudit(auditData.data || []);
      } catch {
        // Silently handle - empty lists shown
      } finally {
        setLoading(false);
      }
    })();
  }, [context]);

  if (loading) return <div className="settings-tab-loader">Lade Verlauf...</div>;

  return (
    <div className="governance-history">
      <div className="governance-view-toggle">
        <button
          className={`governance-toggle-btn ${viewMode === 'actions' ? 'active' : ''}`}
          onClick={() => setViewMode('actions')}
        >
          Aktionen ({actions.length})
        </button>
        <button
          className={`governance-toggle-btn ${viewMode === 'audit' ? 'active' : ''}`}
          onClick={() => setViewMode('audit')}
        >
          Audit-Log ({audit.length})
        </button>
      </div>

      {viewMode === 'actions' ? (
        <div className="governance-list">
          {actions.length === 0 ? (
            <p className="governance-empty-text">Noch keine Aktionen im Verlauf.</p>
          ) : actions.map((action) => (
            <div key={action.id} className="governance-card governance-card-compact">
              <div className="governance-card-header">
                <span
                  className="governance-risk-badge"
                  style={{ background: RISK_COLORS[action.risk_level] || '#888' }}
                >
                  {action.risk_level}
                </span>
                <span className="governance-type">{action.action_type}</span>
                <span className={`governance-status governance-status-${action.status}`}>
                  {STATUS_LABELS[action.status] || action.status}
                </span>
              </div>
              <p className="governance-description">{action.description}</p>
              <div className="governance-meta">
                <span>{formatDate(action.created_at)}</span>
                {action.approved_by && <span>von {action.approved_by}</span>}
                {action.rejection_reason && (
                  <span className="governance-rejection">Grund: {action.rejection_reason}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="governance-list">
          {audit.length === 0 ? (
            <p className="governance-empty-text">Noch keine Audit-Einträge.</p>
          ) : audit.map((entry) => (
            <div key={entry.id} className="governance-audit-entry">
              <div className="governance-audit-header">
                <span className="governance-audit-type">{entry.event_type}</span>
                <span className="governance-audit-actor">{entry.actor}</span>
              </div>
              {entry.description && <p className="governance-audit-desc">{entry.description}</p>}
              <span className="governance-audit-time">{formatDate(entry.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Policies Sub-View
// ==========================================

function PoliciesManager({ context }: { context: AIContext }) {
  const [policies, setPolicies] = useState<GovernancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    action_type: string;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    auto_approve: boolean;
  }>({
    name: '',
    description: '',
    action_type: 'agent_action',
    risk_level: 'medium',
    auto_approve: false,
  });

  const loadPolicies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall<{ data: GovernancePolicy[] }>(
        `/api/${context}/governance/policies`
      );
      setPolicies(data.data || []);
    } catch {
      // Empty list fallback
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    try {
      await apiCall(`/api/${context}/governance/policies`, {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setShowForm(false);
      setFormData({ name: '', description: '', action_type: 'agent_action', risk_level: 'medium', auto_approve: false });
      await loadPolicies();
    } catch {
      // Error silently handled
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Richtlinie wirklich löschen?')) return;
    try {
      await apiCall(`/api/${context}/governance/policies/${id}`, { method: 'DELETE' });
      await loadPolicies();
    } catch {
      // Error silently handled
    }
  };

  const handleToggle = async (policy: GovernancePolicy) => {
    try {
      await apiCall(`/api/${context}/governance/policies/${policy.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !policy.is_active }),
      });
      await loadPolicies();
    } catch {
      // Error silently handled
    }
  };

  if (loading) return <div className="settings-tab-loader">Lade Richtlinien...</div>;

  return (
    <div className="governance-policies">
      <div className="governance-policies-header">
        <h3>Governance-Richtlinien</h3>
        <button
          className="governance-btn governance-btn-create"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Abbrechen' : '+ Neue Richtlinie'}
        </button>
      </div>

      {showForm && (
        <div className="governance-form">
          <input
            type="text"
            placeholder="Name der Richtlinie"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="governance-input"
          />
          <input
            type="text"
            placeholder="Beschreibung (optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="governance-input"
          />
          <div className="governance-form-row">
            <select
              value={formData.action_type}
              onChange={(e) => setFormData({ ...formData, action_type: e.target.value })}
              className="governance-select"
            >
              <option value="agent_action">Agent-Aktion</option>
              <option value="send_email">E-Mail senden</option>
              <option value="create_task">Task erstellen</option>
              <option value="proactive_action">Proaktive Aktion</option>
              <option value="automation">Automation</option>
            </select>
            <select
              value={formData.risk_level}
              onChange={(e) => setFormData({ ...formData, risk_level: e.target.value as 'low' | 'medium' | 'high' | 'critical' })}
              className="governance-select"
            >
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
              <option value="critical">Kritisch</option>
            </select>
            <label className="governance-checkbox-label">
              <input
                type="checkbox"
                checked={formData.auto_approve}
                onChange={(e) => setFormData({ ...formData, auto_approve: e.target.checked })}
              />
              Auto-Genehmigung
            </label>
          </div>
          <button className="governance-btn governance-btn-approve" onClick={handleCreate}>
            Erstellen
          </button>
        </div>
      )}

      {policies.length === 0 ? (
        <div className="governance-empty">
          <span className="governance-empty-icon">📋</span>
          <p>Keine Richtlinien konfiguriert</p>
          <span className="governance-empty-sub">
            Erstelle Richtlinien, um KI-Aktionen automatisch zu genehmigen oder zur Prüfung vorzulegen.
          </span>
        </div>
      ) : (
        <div className="governance-list">
          {policies.map((policy) => (
            <div key={policy.id} className={`governance-card ${!policy.is_active ? 'governance-card-inactive' : ''}`}>
              <div className="governance-card-header">
                <span
                  className="governance-risk-badge"
                  style={{ background: RISK_COLORS[policy.risk_level] || '#888' }}
                >
                  {policy.risk_level}
                </span>
                <span className="governance-type">{policy.name}</span>
                {policy.auto_approve && <span className="governance-auto-badge">Auto</span>}
              </div>
              {policy.description && <p className="governance-description">{policy.description}</p>}
              <div className="governance-meta">
                <span>Typ: {policy.action_type}</span>
                <span>{policy.is_active ? 'Aktiv' : 'Inaktiv'}</span>
              </div>
              <div className="governance-actions">
                <button
                  className="governance-btn governance-btn-toggle"
                  onClick={() => handleToggle(policy)}
                >
                  {policy.is_active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button
                  className="governance-btn governance-btn-reject"
                  onClick={() => handleDelete(policy.id)}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Main GovernanceDashboard
// ==========================================

export function GovernanceDashboard({ context }: GovernanceDashboardProps) {
  const [subView, setSubView] = useState<SubView>('pending');

  return (
    <div className="governance-dashboard">
      <div className="governance-nav">
        <button
          className={`governance-nav-btn ${subView === 'pending' ? 'active' : ''}`}
          onClick={() => setSubView('pending')}
        >
          Ausstehend
        </button>
        <button
          className={`governance-nav-btn ${subView === 'history' ? 'active' : ''}`}
          onClick={() => setSubView('history')}
        >
          Verlauf
        </button>
        <button
          className={`governance-nav-btn ${subView === 'policies' ? 'active' : ''}`}
          onClick={() => setSubView('policies')}
        >
          Richtlinien
        </button>
      </div>

      <div className="governance-content">
        {subView === 'pending' && <PendingActions context={context} />}
        {subView === 'history' && <ActionHistory context={context} />}
        {subView === 'policies' && <PoliciesManager context={context} />}
      </div>
    </div>
  );
}
