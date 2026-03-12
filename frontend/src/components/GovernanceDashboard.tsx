/**
 * GovernanceDashboard - Governance & Audit Trail
 *
 * 3 Sub-Views:
 * - Pending: Ausstehende Genehmigungen mit Approve/Reject
 * - History: Verlauf aller Governance-Aktionen
 * - Policies: Governance-Richtlinien verwalten
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AIContext } from './ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import './GovernanceDashboard.css';

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
  const [actionsInProgress, setActionsInProgress] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const rejectionInputRef = useRef<HTMLInputElement>(null);
  // SSE controller ref removed - now using fetch-based streaming

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

  // SSE for real-time updates (fetch-based to keep API key in headers)
  useEffect(() => {
    const url = `${getApiBaseUrl()}/api/${context}/governance/stream`;
    const headers = getApiFetchHeaders('text/event-stream');
    const controller = new AbortController();
    let retryCount = 0;
    const MAX_RETRIES = 3;

    async function connectSSE() {
      try {
        const res = await fetch(url, {
          headers: { ...headers, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              const eventType = line.slice(6).trim();
              if (['approval_requested', 'action_approved', 'action_rejected'].includes(eventType)) {
                loadPending();
              }
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          setTimeout(connectSSE, 5000 * retryCount);
        }
      }
    }

    connectSSE();
    return () => { controller.abort(); };
  }, [context, loadPending]);

  // Focus rejection input when it appears
  useEffect(() => {
    if (rejectingId && rejectionInputRef.current) {
      rejectionInputRef.current.focus();
    }
  }, [rejectingId]);

  const markInProgress = (id: string) => {
    setActionsInProgress(prev => new Set(prev).add(id));
  };
  const clearInProgress = (id: string) => {
    setActionsInProgress(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleApprove = async (actionId: string) => {
    markInProgress(actionId);
    try {
      await apiCall(`/api/${context}/governance/${actionId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approved_by: 'user' }),
      });
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Genehmigen');
    } finally {
      clearInProgress(actionId);
    }
  };

  const handleRejectSubmit = async (actionId: string) => {
    if (!rejectionReason.trim()) return;
    markInProgress(actionId);
    try {
      await apiCall(`/api/${context}/governance/${actionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejected_by: 'user', reason: rejectionReason }),
      });
      setRejectingId(null);
      setRejectionReason('');
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ablehnen');
    } finally {
      clearInProgress(actionId);
    }
  };

  if (loading) return <div className="settings-tab-loader">Lade ausstehende Aktionen...</div>;
  if (error) return (
    <div className="governance-error">
      <span>{error}</span>
      <button className="governance-btn governance-btn-toggle" onClick={() => { setError(null); loadPending(); }}>
        Erneut versuchen
      </button>
    </div>
  );

  if (actions.length === 0) {
    return (
      <div className="governance-empty">
        <span className="governance-empty-icon" aria-hidden="true">&#10003;</span>
        <p>Keine ausstehenden Genehmigungen</p>
        <span className="governance-empty-sub">Alle KI-Aktionen sind verarbeitet.</span>
      </div>
    );
  }

  return (
    <div className="governance-list" role="list">
      {actions.map((action) => {
        const inProgress = actionsInProgress.has(action.id);
        const isRejecting = rejectingId === action.id;

        return (
          <div key={action.id} className="governance-card" role="listitem">
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

            {isRejecting ? (
              <div className="governance-reject-form">
                <input
                  ref={rejectionInputRef}
                  type="text"
                  className="governance-input"
                  placeholder="Ablehnungsgrund eingeben..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRejectSubmit(action.id);
                    if (e.key === 'Escape') { setRejectingId(null); setRejectionReason(''); }
                  }}
                  disabled={inProgress}
                />
                <div className="governance-reject-form-actions">
                  <button
                    className="governance-btn governance-btn-reject"
                    onClick={() => handleRejectSubmit(action.id)}
                    disabled={inProgress || !rejectionReason.trim()}
                  >
                    {inProgress ? 'Wird abgelehnt...' : 'Ablehnen'}
                  </button>
                  <button
                    className="governance-btn governance-btn-toggle"
                    onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                    disabled={inProgress}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="governance-actions">
                <button
                  className="governance-btn governance-btn-approve"
                  onClick={() => handleApprove(action.id)}
                  disabled={inProgress}
                >
                  {inProgress ? 'Wird genehmigt...' : 'Genehmigen'}
                </button>
                <button
                  className="governance-btn governance-btn-reject"
                  onClick={() => setRejectingId(action.id)}
                  disabled={inProgress}
                >
                  Ablehnen
                </button>
              </div>
            )}
          </div>
        );
      })}
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
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'actions' | 'audit'>('actions');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const loadHistory = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      const offset = pageNum * PAGE_SIZE;
      const [actionsData, auditData] = await Promise.all([
        apiCall<{ data: GovernanceAction[] }>(
          `/api/${context}/governance/history?limit=${PAGE_SIZE}&offset=${offset}`
        ),
        apiCall<{ data: AuditEntry[] }>(
          `/api/${context}/governance/audit?limit=${PAGE_SIZE}&offset=${offset}&days=30`
        ),
      ]);
      setActions(actionsData.data || []);
      setAudit(auditData.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Verlaufs');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { loadHistory(page); }, [loadHistory, page]);

  if (loading) return <div className="settings-tab-loader">Lade Verlauf...</div>;
  if (error) return (
    <div className="governance-error">
      <span>{error}</span>
      <button className="governance-btn governance-btn-toggle" onClick={() => loadHistory(page)}>
        Erneut versuchen
      </button>
    </div>
  );

  return (
    <div className="governance-history">
      <div className="governance-view-toggle" role="tablist" aria-label="Verlauf-Ansicht">
        <button
          role="tab"
          aria-selected={viewMode === 'actions'}
          className={`governance-toggle-btn ${viewMode === 'actions' ? 'active' : ''}`}
          onClick={() => setViewMode('actions')}
        >
          Aktionen ({actions.length})
        </button>
        <button
          role="tab"
          aria-selected={viewMode === 'audit'}
          className={`governance-toggle-btn ${viewMode === 'audit' ? 'active' : ''}`}
          onClick={() => setViewMode('audit')}
        >
          Audit-Log ({audit.length})
        </button>
      </div>

      {viewMode === 'actions' ? (
        <div className="governance-list" role="tabpanel">
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
        <div className="governance-list" role="tabpanel">
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

      {/* Pagination */}
      <div className="governance-pagination">
        <button
          className="governance-btn governance-btn-toggle"
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Zurück
        </button>
        <span className="governance-page-info">Seite {page + 1}</span>
        <button
          className="governance-btn governance-btn-toggle"
          onClick={() => setPage(p => p + 1)}
          disabled={
            (viewMode === 'actions' && actions.length < PAGE_SIZE) ||
            (viewMode === 'audit' && audit.length < PAGE_SIZE)
          }
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

// ==========================================
// Policies Sub-View
// ==========================================

function PoliciesManager({ context }: { context: AIContext }) {
  const [policies, setPolicies] = useState<GovernancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    action_type: 'agent_action',
    risk_level: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    auto_approve: false,
    notify_on_auto_approve: true,
    conditions: [] as unknown[],
  });

  const loadPolicies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall<{ data: GovernancePolicy[] }>(
        `/api/${context}/governance/policies`
      );
      setPolicies(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Richtlinien');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    setCreating(true);
    try {
      await apiCall(`/api/${context}/governance/policies`, {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          action_type: formData.action_type,
          risk_level: formData.risk_level,
          auto_approve: formData.auto_approve,
          notify_on_auto_approve: formData.notify_on_auto_approve,
          conditions: formData.conditions,
        }),
      });
      setShowForm(false);
      setFormData({
        name: '', description: '', action_type: 'agent_action',
        risk_level: 'medium', auto_approve: false,
        notify_on_auto_approve: true, conditions: [],
      });
      await loadPolicies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiCall(`/api/${context}/governance/policies/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      await loadPolicies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (policy: GovernancePolicy) => {
    try {
      await apiCall(`/api/${context}/governance/policies/${policy.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !policy.is_active }),
      });
      await loadPolicies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Umschalten');
    }
  };

  if (loading) return <div className="settings-tab-loader">Lade Richtlinien...</div>;

  return (
    <div className="governance-policies">
      {error && (
        <div className="governance-error governance-error-inline">
          <span>{error}</span>
          <button className="governance-btn governance-btn-toggle" onClick={() => setError(null)}>
            Schließen
          </button>
        </div>
      )}

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
            autoFocus
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
              aria-label="Aktionstyp"
            >
              <option value="agent_action">Agent-Aktion</option>
              <option value="send_email">E-Mail senden</option>
              <option value="create_task">Task erstellen</option>
              <option value="proactive_action">Proaktive Aktion</option>
              <option value="automation">Automation</option>
            </select>
            <select
              value={formData.risk_level}
              onChange={(e) => setFormData({ ...formData, risk_level: e.target.value as typeof formData.risk_level })}
              className="governance-select"
              aria-label="Risikostufe"
            >
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
              <option value="critical">Kritisch</option>
            </select>
          </div>
          <div className="governance-form-row">
            <label className="governance-checkbox-label">
              <input
                type="checkbox"
                checked={formData.auto_approve}
                onChange={(e) => setFormData({ ...formData, auto_approve: e.target.checked })}
              />
              Auto-Genehmigung
            </label>
            <label className="governance-checkbox-label">
              <input
                type="checkbox"
                checked={formData.notify_on_auto_approve}
                onChange={(e) => setFormData({ ...formData, notify_on_auto_approve: e.target.checked })}
              />
              Benachrichtigung bei Auto-Genehmigung
            </label>
          </div>
          <button
            className="governance-btn governance-btn-approve"
            onClick={handleCreate}
            disabled={creating || !formData.name.trim()}
          >
            {creating ? 'Wird erstellt...' : 'Erstellen'}
          </button>
        </div>
      )}

      {policies.length === 0 ? (
        <div className="governance-empty">
          <span className="governance-empty-icon" aria-hidden="true">&#128203;</span>
          <p>Keine Richtlinien konfiguriert</p>
          <span className="governance-empty-sub">
            Erstelle Richtlinien, um KI-Aktionen automatisch zu genehmigen oder zur Prüfung vorzulegen.
          </span>
        </div>
      ) : (
        <div className="governance-list" role="list">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className={`governance-card ${!policy.is_active ? 'governance-card-inactive' : ''}`}
              role="listitem"
            >
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

              {confirmDeleteId === policy.id ? (
                <div className="governance-confirm-delete">
                  <span>Richtlinie wirklich löschen?</span>
                  <div className="governance-actions">
                    <button
                      className="governance-btn governance-btn-reject"
                      onClick={() => handleDelete(policy.id)}
                      disabled={deletingId === policy.id}
                    >
                      {deletingId === policy.id ? 'Wird gelöscht...' : 'Ja, löschen'}
                    </button>
                    <button
                      className="governance-btn governance-btn-toggle"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deletingId === policy.id}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="governance-actions">
                  <button
                    className="governance-btn governance-btn-toggle"
                    onClick={() => handleToggle(policy)}
                  >
                    {policy.is_active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  <button
                    className="governance-btn governance-btn-reject"
                    onClick={() => setConfirmDeleteId(policy.id)}
                  >
                    Löschen
                  </button>
                </div>
              )}
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

  const handleKeyDown = (e: React.KeyboardEvent, view: SubView) => {
    const views: SubView[] = ['pending', 'history', 'policies'];
    const currentIdx = views.indexOf(view);
    let nextIdx = currentIdx;

    if (e.key === 'ArrowRight') nextIdx = Math.min(currentIdx + 1, views.length - 1);
    else if (e.key === 'ArrowLeft') nextIdx = Math.max(currentIdx - 1, 0);
    else return;

    e.preventDefault();
    setSubView(views[nextIdx]);
    const nextBtn = document.querySelector(`[data-gov-tab="${views[nextIdx]}"]`) as HTMLElement;
    nextBtn?.focus();
  };

  return (
    <div className="governance-dashboard">
      <div className="governance-nav" role="tablist" aria-label="Governance-Bereiche">
        {([
          { key: 'pending' as const, label: 'Ausstehend' },
          { key: 'history' as const, label: 'Verlauf' },
          { key: 'policies' as const, label: 'Richtlinien' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={subView === key}
            tabIndex={subView === key ? 0 : -1}
            data-gov-tab={key}
            className={`governance-nav-btn ${subView === key ? 'active' : ''}`}
            onClick={() => setSubView(key)}
            onKeyDown={(e) => handleKeyDown(e, key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="governance-content" role="tabpanel" aria-label={subView}>
        {subView === 'pending' && <PendingActions context={context} />}
        {subView === 'history' && <ActionHistory context={context} />}
        {subView === 'policies' && <PoliciesManager context={context} />}
      </div>
    </div>
  );
}
