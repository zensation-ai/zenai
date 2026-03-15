/**
 * A2AAgentsPanel - Externe A2A Agenten verwalten
 *
 * Phase 60: Agent-to-Agent Protocol
 * - Agenten-Karten mit Health-Status, Skills, URL
 * - Agent registrieren (Auto-Discovery via /.well-known/agent.json)
 * - Health Check pro Agent
 * - Aufgabe an Agent senden
 * - Agent entfernen mit Bestaetigung
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { logError } from '../utils/errors';
import './A2AAgentsPanel.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExternalAgent {
  id: string;
  name: string;
  url: string;
  description?: string;
  skills?: string[];
  healthy: boolean;
  last_health_check?: string;
  created_at: string;
}

interface A2ATask {
  id: string;
  external_agent_id?: string;
  agent_name?: string;
  task_description: string;
  status: string;
  result?: string;
  error?: string;
  created_at: string;
  updated_at?: string;
}

interface A2AAgentsPanelProps {
  context: string;
}

const TASK_STATUS_MAP: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Gesendet', color: '#3b82f6' },
  working: { label: 'In Arbeit', color: '#f59e0b' },
  completed: { label: 'Abgeschlossen', color: '#22c55e' },
  failed: { label: 'Fehlgeschlagen', color: '#ef4444' },
  canceled: { label: 'Abgebrochen', color: '#9ca3af' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function A2AAgentsPanel({ context }: A2AAgentsPanelProps) {
  const [agents, setAgents] = useState<ExternalAgent[]>([]);
  const [tasks, setTasks] = useState<A2ATask[]>([]);
  const [loading, setLoading] = useState(false);

  // Register form
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: '', url: '', description: '' });
  const [registering, setRegistering] = useState(false);

  // Send task
  const [sendingTaskAgentId, setSendingTaskAgentId] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState('');

  // Health check
  const [checkingHealthId, setCheckingHealthId] = useState<string | null>(null);

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ─── Data Loading ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, tasksRes] = await Promise.all([
        axios.get(`/api/${context}/a2a/external-agents`),
        axios.get(`/api/${context}/a2a/tasks`),
      ]);
      setAgents(agentsRes.data.data || agentsRes.data.agents || []);
      setTasks(tasksRes.data.data || tasksRes.data.tasks || []);
    } catch (err) {
      logError('A2AAgentsPanel:loadData', err);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Register Agent ─────────────────────────────────────────────────────

  const handleRegister = useCallback(async () => {
    if (!registerForm.name.trim() || !registerForm.url.trim()) return;
    setRegistering(true);
    try {
      await axios.post(`/api/${context}/a2a/external-agents`, registerForm);
      showToast(`Agent "${registerForm.name}" registriert`, 'success');
      setRegisterForm({ name: '', url: '', description: '' });
      setShowRegister(false);
      await loadData();
    } catch (err) {
      logError('A2AAgentsPanel:register', err);
      showToast('Fehler beim Registrieren', 'error');
    } finally {
      setRegistering(false);
    }
  }, [context, registerForm, loadData]);

  // ─── Health Check ───────────────────────────────────────────────────────

  const handleHealthCheck = useCallback(async (id: string) => {
    setCheckingHealthId(id);
    try {
      const res = await axios.post(`/api/${context}/a2a/external-agents/${id}/health`);
      const healthy = res.data.data?.healthy ?? res.data.healthy;
      showToast(healthy ? 'Agent erreichbar' : 'Agent nicht erreichbar', healthy ? 'success' : 'error');
      await loadData();
    } catch (err) {
      logError('A2AAgentsPanel:healthCheck', err);
      showToast('Health Check fehlgeschlagen', 'error');
    } finally {
      setCheckingHealthId(null);
    }
  }, [context, loadData]);

  // ─── Send Task ──────────────────────────────────────────────────────────

  const handleSendTask = useCallback(async (agentId: string) => {
    if (!taskInput.trim()) return;
    try {
      await axios.post(`/api/${context}/a2a/external-agents/${agentId}/send`, {
        task: taskInput,
      });
      showToast('Aufgabe gesendet', 'success');
      setTaskInput('');
      setSendingTaskAgentId(null);
      await loadData();
    } catch (err) {
      logError('A2AAgentsPanel:sendTask', err);
      showToast('Fehler beim Senden', 'error');
    }
  }, [context, taskInput, loadData]);

  // ─── Delete Agent ───────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    try {
      await axios.delete(`/api/${context}/a2a/external-agents/${id}`);
      showToast('Agent entfernt', 'success');
      setConfirmDeleteId(null);
      await loadData();
    } catch (err) {
      logError('A2AAgentsPanel:delete', err);
      showToast('Fehler beim Entfernen', 'error');
    }
  }, [context, loadData]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="a2a-panel">
      {/* Header */}
      <div className="a2a-panel-header">
        <h3>
          Externe Agenten
          <span className="a2a-count">({agents.length})</span>
        </h3>
        <button
          type="button"
          className="a2a-register-btn"
          onClick={() => setShowRegister(!showRegister)}
        >
          {showRegister ? 'Abbrechen' : '+ Agent registrieren'}
        </button>
      </div>

      {/* Register Form */}
      {showRegister && (
        <div className="a2a-register-form">
          <h4>Neuen Agent registrieren</h4>
          <div className="a2a-form-fields">
            <div className="a2a-form-field">
              <label>Name</label>
              <input
                type="text"
                value={registerForm.name}
                onChange={(e) => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Research Agent"
              />
            </div>
            <div className="a2a-form-field">
              <label>URL (Auto-Discovery via /.well-known/agent.json)</label>
              <input
                type="url"
                value={registerForm.url}
                onChange={(e) => setRegisterForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://agent.example.com"
              />
            </div>
            <div className="a2a-form-field">
              <label>Beschreibung (optional)</label>
              <textarea
                value={registerForm.description}
                onChange={(e) => setRegisterForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Was kann dieser Agent?"
                rows={2}
              />
            </div>
            <div className="a2a-form-actions">
              <button
                type="button"
                className="a2a-form-submit"
                onClick={handleRegister}
                disabled={!registerForm.name.trim() || !registerForm.url.trim() || registering}
              >
                {registering ? 'Registriere...' : 'Registrieren'}
              </button>
              <button
                type="button"
                className="a2a-form-cancel"
                onClick={() => {
                  setShowRegister(false);
                  setRegisterForm({ name: '', url: '', description: '' });
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent List */}
      {loading ? (
        <div className="a2a-loading">Lade externe Agenten...</div>
      ) : agents.length === 0 ? (
        <div className="a2a-empty">
          <div className="a2a-empty-icon">🌐</div>
          <div>Keine externen Agenten registriert.</div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.6 }}>
            Registriere einen A2A-kompatiblen Agent, um Aufgaben zu delegieren.
          </div>
        </div>
      ) : (
        <div className="a2a-agents-grid">
          {agents.map((agent) => (
            <div key={agent.id} className="a2a-agent-card">
              <div className="a2a-agent-card-top">
                <span className={`a2a-health-dot ${agent.healthy ? 'healthy' : 'unhealthy'}`} />
                <span className="a2a-agent-name">{agent.name}</span>
              </div>

              <div className="a2a-agent-url">{agent.url}</div>

              {agent.description && (
                <div className="a2a-agent-description">{agent.description}</div>
              )}

              {agent.skills && agent.skills.length > 0 && (
                <div className="a2a-agent-skills">
                  {agent.skills.map((skill) => (
                    <span key={skill} className="a2a-skill-tag">{skill}</span>
                  ))}
                </div>
              )}

              {agent.last_health_check && (
                <div className="a2a-agent-meta">
                  Letzter Health Check:{' '}
                  {new Date(agent.last_health_check).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}

              <div className="a2a-agent-actions">
                <button
                  type="button"
                  className="a2a-action-btn primary"
                  onClick={() => {
                    if (sendingTaskAgentId === agent.id) {
                      setSendingTaskAgentId(null);
                      setTaskInput('');
                    } else {
                      setSendingTaskAgentId(agent.id);
                    }
                  }}
                >
                  {sendingTaskAgentId === agent.id ? 'Abbrechen' : 'Aufgabe senden'}
                </button>
                <button
                  type="button"
                  className="a2a-action-btn"
                  onClick={() => handleHealthCheck(agent.id)}
                  disabled={checkingHealthId === agent.id}
                >
                  {checkingHealthId === agent.id ? 'Pruefe...' : 'Health Check'}
                </button>
                <button
                  type="button"
                  className="a2a-action-btn danger"
                  onClick={() => setConfirmDeleteId(agent.id)}
                >
                  Entfernen
                </button>
              </div>

              {/* Inline Send Task */}
              {sendingTaskAgentId === agent.id && (
                <div className="a2a-send-task-inline">
                  <input
                    type="text"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    placeholder="Aufgabe beschreiben..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && taskInput.trim()) handleSendTask(agent.id);
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSendTask(agent.id)}
                    disabled={!taskInput.trim()}
                  >
                    Senden
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* A2A Tasks */}
      {tasks.length > 0 && (
        <div className="a2a-tasks-section">
          <h4>A2A Aufgaben</h4>
          {tasks.map((task) => {
            const statusCfg = TASK_STATUS_MAP[task.status] || { label: task.status, color: '#9ca3af' };
            return (
              <div key={task.id} className="a2a-task-card">
                <div className="a2a-task-card-header">
                  <span
                    className="a2a-task-status"
                    style={{ background: `${statusCfg.color}22`, color: statusCfg.color }}
                  >
                    {statusCfg.label}
                  </span>
                  <span className="a2a-task-desc">
                    {task.task_description?.substring(0, 100) || 'Keine Beschreibung'}
                    {(task.task_description?.length || 0) > 100 ? '...' : ''}
                  </span>
                  {task.agent_name && <span className="a2a-task-agent">{task.agent_name}</span>}
                  <span className="a2a-task-date">
                    {new Date(task.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {(task.result || task.error) && (
                  <div className={`a2a-task-body ${task.error ? 'a2a-task-error' : ''}`}>
                    {task.result || task.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDeleteId && (
        <div className="a2a-confirm-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="a2a-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>Agent entfernen</h4>
            <p>
              Soll der Agent &quot;{agents.find(a => a.id === confirmDeleteId)?.name}&quot; wirklich
              entfernt werden? Bestehende Aufgaben bleiben erhalten.
            </p>
            <div className="a2a-confirm-actions">
              <button
                type="button"
                className="a2a-form-cancel"
                onClick={() => setConfirmDeleteId(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="a2a-action-btn danger"
                style={{ background: 'rgba(239,68,68,0.15)' }}
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Entfernen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
