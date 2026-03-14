/**
 * AgentTeamsPage Component
 *
 * Frontend for the Multi-Agent Task Orchestration system.
 * Features: SSE Streaming, Agent Templates, Coder Agent, Analytics.
 * Tabs: Teams (Phase 45), Agenten (Phase 64), Workflows (Phase 64), A2A (Phase 60).
 *
 * Phase 45 + 60 + 64
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AIContext } from './ContextSwitcher';
import { showToast } from './Toast';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import { logError } from '../utils/errors';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import '../neurodesign.css';
import './AgentTeamsPage.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentResult {
  role: string;
  success: boolean;
  toolsUsed: string[];
  executionTimeMs: number;
  error?: string;
}

interface TeamResult {
  teamId: string;
  finalOutput: string;
  strategy: string;
  agents: AgentResult[];
  stats: {
    executionTimeMs: number;
    totalTokens: { input: number; output: number } | number;
    sharedMemoryEntries: number;
  };
}

interface HistoryEntry {
  id: string;
  teamId: string;
  task: string;
  strategy: string;
  finalOutput: string;
  agents: AgentResult[];
  executionTimeMs: number;
  tokens: { input: number; output: number } | number;
  success: boolean;
  savedAsIdeaId?: string;
  createdAt: string;
  status?: string;
  checkpointStep?: number;
  pauseReason?: string;
}

const EXECUTION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  running: { label: 'Läuft', color: '#3b82f6' },
  completed: { label: 'Abgeschlossen', color: '#22c55e' },
  failed: { label: 'Fehlgeschlagen', color: '#ef4444' },
  paused: { label: 'Pausiert', color: '#f59e0b' },
  awaiting_approval: { label: 'Genehmigung nötig', color: '#f97316' },
  cancelled: { label: 'Abgebrochen', color: '#9ca3af' },
};

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  strategy: string;
  pipeline?: string[];
  skipReview?: boolean;
  promptHint?: string;
}

interface StreamEvent {
  type: string;
  teamId?: string;
  strategy?: string;
  pipeline?: string[];
  agentRole?: string;
  agentIndex?: number;
  totalAgents?: number;
  subTask?: string;
  result?: Partial<AgentResult>;
  finalOutput?: string;
  error?: string;
  // Full result payload
  success?: boolean;
  agents?: AgentResult[];
  stats?: {
    executionTimeMs: number;
    totalTokens: { input: number; output: number };
    sharedMemoryEntries: number;
  };
}

type Strategy = 'research_write_review' | 'research_only' | 'write_only' | 'code_solve' | 'research_code_review' | 'custom';

const STRATEGIES: { id: Strategy; label: string; icon: string; desc: string }[] = [
  { id: 'research_write_review', label: 'Komplett', icon: '🔬', desc: 'Recherche, Schreiben, Review' },
  { id: 'research_only', label: 'Recherche', icon: '🔍', desc: 'Nur Informationen sammeln' },
  { id: 'write_only', label: 'Schreiben', icon: '✍️', desc: 'Nur Content erstellen' },
  { id: 'code_solve', label: 'Code', icon: '💻', desc: 'Code generieren & testen' },
  { id: 'research_code_review', label: 'Code-Review', icon: '🔍', desc: 'Code analysieren & verbessern' },
  { id: 'custom', label: 'Angepasst', icon: '🛠️', desc: 'Eigene Pipeline' },
];

const ROLE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  researcher: { icon: '🔍', label: 'Researcher', color: '#3b82f6' },
  writer: { icon: '✍️', label: 'Writer', color: '#8b5cf6' },
  reviewer: { icon: '📋', label: 'Reviewer', color: '#22c55e' },
  coder: { icon: '💻', label: 'Coder', color: '#f59e0b' },
};

// ─── Agent Identity Types (Phase 64) ────────────────────────────────────────

interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  description?: string;
  enabled: boolean;
  trust_level: 'low' | 'medium' | 'high';
  persona?: {
    tone?: string;
    expertise?: string[];
    style?: string;
    language?: string;
  };
  permissions?: string[];
  rate_limit?: number;
  created_at: string;
  updated_at: string;
}

// ─── Workflow Types (Phase 64) ──────────────────────────────────────────────

interface WorkflowNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'human_review';
  config: Record<string, unknown>;
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at?: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  status: string;
  started_at: string;
  completed_at?: string;
  result?: string;
  error?: string;
}

// ─── A2A Types (Phase 60) ───────────────────────────────────────────────────

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

// ─── Tab Type ───────────────────────────────────────────────────────────────

type AgentTab = 'teams' | 'identities' | 'workflows' | 'a2a';

const AGENT_TABS: { id: AgentTab; label: string; icon: string }[] = [
  { id: 'teams', label: 'Teams', icon: '🚀' },
  { id: 'identities', label: 'Agenten', icon: '🤖' },
  { id: 'workflows', label: 'Workflows', icon: '🔄' },
  { id: 'a2a', label: 'A2A', icon: '🌐' },
];

// ─── Trust Level Config ─────────────────────────────────────────────────────

const TRUST_LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: '#ef4444' },
  medium: { label: 'Mittel', color: '#f59e0b' },
  high: { label: 'Hoch', color: '#22c55e' },
};

// ─── Component ──────────────────────────────────────────────────────────────

interface AgentTeamsPageProps {
  context: AIContext;
  onBack?: () => void;
  embedded?: boolean;
}

export function AgentTeamsPage({ context, onBack, embedded }: AgentTeamsPageProps) {
  const greeting = getTimeBasedGreeting();
  const [activeTab, setActiveTab] = useState<AgentTab>('teams');

  // ─── Teams Tab State ────────────────────────────────────────────────────
  const [task, setTask] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('research_write_review');
  const [skipReview, setSkipReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifiedStrategy, setClassifiedStrategy] = useState<string | null>(null);
  const [result, setResult] = useState<TeamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [savingIdeaId, setSavingIdeaId] = useState<string | null>(null);

  // Streaming state
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<{ role: string; index: number; total: number; subTask: string } | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Analytics state
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<{
    totals: { executions: number; successful: number; failed: number; tokens: number; successRate: number };
    byStrategy: Array<{ strategy: string; count: number; successful: number; avgExecutionTime: number; avgTokens: number }>;
    dailyTrend: Array<{ date: string; executions: number; successful: number; avgTime: number }>;
  } | null>(null);

  // ─── Agent Identity Tab State (Phase 64) ────────────────────────────────
  const [identities, setIdentities] = useState<AgentIdentity[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<AgentIdentity | null>(null);
  const [showIdentityForm, setShowIdentityForm] = useState(false);
  const [identityForm, setIdentityForm] = useState({
    name: '',
    role: 'researcher',
    description: '',
    trust_level: 'medium' as 'low' | 'medium' | 'high',
    enabled: true,
    persona_tone: '',
    persona_expertise: '',
    persona_style: '',
    persona_language: 'de',
    permissions: '',
    rate_limit: 100,
  });

  // ─── Workflow Tab State (Phase 64) ──────────────────────────────────────
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [executingWorkflowId, setExecutingWorkflowId] = useState<string | null>(null);
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);

  // ─── A2A Tab State (Phase 60) ──────────────────────────────────────────
  const [externalAgents, setExternalAgents] = useState<ExternalAgent[]>([]);
  const [a2aTasks, setA2ATasks] = useState<A2ATask[]>([]);
  const [a2aLoading, setA2aLoading] = useState(false);
  const [showRegisterAgent, setShowRegisterAgent] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: '', url: '', description: '' });
  const [sendingTaskAgentId, setSendingTaskAgentId] = useState<string | null>(null);
  const [sendTaskForm, setSendTaskForm] = useState({ task: '' });
  const [checkingHealthId, setCheckingHealthId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<{ abort: () => void } | null>(null);

  // ─── Teams Tab Callbacks ────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/history', {
        params: { context, limit: 10 },
      });
      if (res.data.success) {
        setHistory(res.data.executions);
      }
    } catch (err) {
      logError('AgentTeamsPage:loadHistory', err);
    }
  }, [context]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/templates');
      if (res.data.success) {
        setTemplates(res.data.templates);
      }
    } catch (err) {
      logError('AgentTeamsPage:loadTemplates', err);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents/analytics', {
        params: { context, days: 30 },
      });
      if (res.data.success) {
        setAnalytics(res.data);
      }
    } catch (err) {
      logError('AgentTeamsPage:loadAnalytics', err);
    }
  }, [context]);

  // ─── Agent Identity Callbacks (Phase 64) ────────────────────────────────

  const loadIdentities = useCallback(async () => {
    setIdentitiesLoading(true);
    try {
      const res = await axios.get('/api/agent-identities');
      if (res.data.success) {
        setIdentities(res.data.data || res.data.identities || []);
      }
    } catch (err) {
      logError('AgentTeamsPage:loadIdentities', err);
    } finally {
      setIdentitiesLoading(false);
    }
  }, []);

  const handleSaveIdentity = async () => {
    try {
      const payload = {
        name: identityForm.name,
        role: identityForm.role,
        description: identityForm.description || undefined,
        trust_level: identityForm.trust_level,
        enabled: identityForm.enabled,
        persona: {
          tone: identityForm.persona_tone || undefined,
          expertise: identityForm.persona_expertise ? identityForm.persona_expertise.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          style: identityForm.persona_style || undefined,
          language: identityForm.persona_language || undefined,
        },
        permissions: identityForm.permissions ? identityForm.permissions.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        rate_limit: identityForm.rate_limit,
      };

      if (editingIdentity) {
        await axios.put(`/api/agent-identities/${editingIdentity.id}`, payload);
        showToast('Agent aktualisiert', 'success');
      } else {
        await axios.post('/api/agent-identities', payload);
        showToast('Agent erstellt', 'success');
      }
      setShowIdentityForm(false);
      setEditingIdentity(null);
      resetIdentityForm();
      await loadIdentities();
    } catch (err) {
      logError('AgentTeamsPage:saveIdentity', err);
      showToast('Fehler beim Speichern', 'error');
    }
  };

  const handleDeleteIdentity = async (id: string) => {
    try {
      await axios.delete(`/api/agent-identities/${id}`);
      showToast('Agent gelöscht', 'success');
      await loadIdentities();
    } catch (err) {
      logError('AgentTeamsPage:deleteIdentity', err);
      showToast('Fehler beim Löschen', 'error');
    }
  };

  const handleEditIdentity = (identity: AgentIdentity) => {
    setEditingIdentity(identity);
    setIdentityForm({
      name: identity.name,
      role: identity.role,
      description: identity.description || '',
      trust_level: identity.trust_level,
      enabled: identity.enabled,
      persona_tone: identity.persona?.tone || '',
      persona_expertise: identity.persona?.expertise?.join(', ') || '',
      persona_style: identity.persona?.style || '',
      persona_language: identity.persona?.language || 'de',
      permissions: identity.permissions?.join(', ') || '',
      rate_limit: identity.rate_limit || 100,
    });
    setShowIdentityForm(true);
  };

  const resetIdentityForm = () => {
    setIdentityForm({
      name: '',
      role: 'researcher',
      description: '',
      trust_level: 'medium',
      enabled: true,
      persona_tone: '',
      persona_expertise: '',
      persona_style: '',
      persona_language: 'de',
      permissions: '',
      rate_limit: 100,
    });
  };

  // ─── Workflow Callbacks (Phase 64) ──────────────────────────────────────

  const loadWorkflows = useCallback(async () => {
    setWorkflowsLoading(true);
    try {
      const [wfRes, tmplRes, runsRes] = await Promise.all([
        axios.get('/api/agent-workflows'),
        axios.get('/api/agent-workflows/templates'),
        axios.get('/api/agent-workflow-runs'),
      ]);
      if (wfRes.data.success) setWorkflows(wfRes.data.data || wfRes.data.workflows || []);
      if (tmplRes.data.success) setWorkflowTemplates(tmplRes.data.data || tmplRes.data.templates || []);
      if (runsRes.data.success) setWorkflowRuns(runsRes.data.data || runsRes.data.runs || []);
    } catch (err) {
      logError('AgentTeamsPage:loadWorkflows', err);
    } finally {
      setWorkflowsLoading(false);
    }
  }, []);

  const handleSaveTemplateAsWorkflow = async (template: WorkflowTemplate) => {
    try {
      await axios.post('/api/agent-workflows', {
        name: template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
      });
      showToast(`Workflow "${template.name}" gespeichert`, 'success');
      await loadWorkflows();
    } catch (err) {
      logError('AgentTeamsPage:saveTemplate', err);
      showToast('Fehler beim Speichern', 'error');
    }
  };

  const handleExecuteWorkflow = async (workflowId: string) => {
    setExecutingWorkflowId(workflowId);
    try {
      const res = await axios.post(`/api/agent-workflows/${workflowId}/execute`);
      if (res.data.success) {
        showToast('Workflow gestartet', 'success');
        await loadWorkflows();
      } else {
        showToast(res.data.error || 'Fehler beim Starten', 'error');
      }
    } catch (err) {
      logError('AgentTeamsPage:executeWorkflow', err);
      showToast('Fehler beim Starten', 'error');
    } finally {
      setExecutingWorkflowId(null);
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    try {
      await axios.delete(`/api/agent-workflows/${id}`);
      showToast('Workflow gelöscht', 'success');
      await loadWorkflows();
    } catch (err) {
      logError('AgentTeamsPage:deleteWorkflow', err);
      showToast('Fehler beim Löschen', 'error');
    }
  };

  // ─── A2A Callbacks (Phase 60) ──────────────────────────────────────────

  const loadA2AData = useCallback(async () => {
    setA2aLoading(true);
    try {
      const [agentsRes, tasksRes] = await Promise.all([
        axios.get(`/api/${context}/a2a/external-agents`),
        axios.get(`/api/${context}/a2a/tasks`),
      ]);
      if (agentsRes.data.success) setExternalAgents(agentsRes.data.data || agentsRes.data.agents || []);
      if (tasksRes.data.success) setA2ATasks(tasksRes.data.data || tasksRes.data.tasks || []);
    } catch (err) {
      logError('AgentTeamsPage:loadA2A', err);
    } finally {
      setA2aLoading(false);
    }
  }, [context]);

  const handleRegisterAgent = async () => {
    if (!registerForm.name.trim() || !registerForm.url.trim()) {
      showToast('Name und URL sind erforderlich', 'error');
      return;
    }
    try {
      await axios.post(`/api/${context}/a2a/external-agents`, registerForm);
      showToast('Agent registriert', 'success');
      setShowRegisterAgent(false);
      setRegisterForm({ name: '', url: '', description: '' });
      await loadA2AData();
    } catch (err) {
      logError('AgentTeamsPage:registerAgent', err);
      showToast('Registrierung fehlgeschlagen', 'error');
    }
  };

  const handleRemoveAgent = async (id: string) => {
    try {
      await axios.delete(`/api/${context}/a2a/external-agents/${id}`);
      showToast('Agent entfernt', 'success');
      await loadA2AData();
    } catch (err) {
      logError('AgentTeamsPage:removeAgent', err);
      showToast('Fehler beim Entfernen', 'error');
    }
  };

  const handleHealthCheck = async (id: string) => {
    setCheckingHealthId(id);
    try {
      const res = await axios.post(`/api/${context}/a2a/external-agents/${id}/health`);
      if (res.data.success) {
        showToast(res.data.healthy ? 'Agent erreichbar' : 'Agent nicht erreichbar', res.data.healthy ? 'success' : 'error');
        await loadA2AData();
      }
    } catch (err) {
      logError('AgentTeamsPage:healthCheck', err);
      showToast('Health Check fehlgeschlagen', 'error');
    } finally {
      setCheckingHealthId(null);
    }
  };

  const handleSendTask = async (agentId: string) => {
    if (!sendTaskForm.task.trim()) {
      showToast('Aufgabe beschreiben', 'error');
      return;
    }
    try {
      await axios.post(`/api/${context}/a2a/external-agents/${agentId}/send`, {
        task: sendTaskForm.task,
      });
      showToast('Aufgabe gesendet', 'success');
      setSendingTaskAgentId(null);
      setSendTaskForm({ task: '' });
      await loadA2AData();
    } catch (err) {
      logError('AgentTeamsPage:sendTask', err);
      showToast('Senden fehlgeschlagen', 'error');
    }
  };

  // Durable execution controls
  const handlePauseExecution = async (executionId: string) => {
    try {
      await axios.post(`/api/agents/executions/${executionId}/pause`, { context });
      showToast('Ausführung pausiert', 'success');
      await loadHistory();
    } catch (err) {
      logError('AgentTeamsPage:pause', err);
      showToast('Fehler beim Pausieren', 'error');
    }
  };

  const handleCancelExecution = async (executionId: string) => {
    try {
      await axios.post(`/api/agents/executions/${executionId}/cancel`, { context });
      showToast('Ausführung abgebrochen', 'success');
      await loadHistory();
    } catch (err) {
      logError('AgentTeamsPage:cancel', err);
      showToast('Fehler beim Abbrechen', 'error');
    }
  };

  // ─── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    loadHistory();
    loadTemplates();
  }, [loadHistory, loadTemplates]);

  // Load tab-specific data on tab change
  useEffect(() => {
    if (activeTab === 'identities') loadIdentities();
    if (activeTab === 'workflows') loadWorkflows();
    if (activeTab === 'a2a') loadA2AData();
  }, [activeTab, loadIdentities, loadWorkflows, loadA2AData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      eventSourceRef.current?.abort();
    };
  }, []);

  // Escape key to cancel
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && loading) {
      abortControllerRef.current?.abort();
      eventSourceRef.current?.abort();
      setLoading(false);
      setCurrentAgent(null);
      showToast('Ausführung abgebrochen', 'info');
    }
  }, [loading]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Teams Tab Handlers ─────────────────────────────────────────────────

  const handleClassify = async () => {
    if (!task.trim()) return;
    setClassifying(true);
    setClassifiedStrategy(null);
    try {
      const res = await axios.post('/api/agents/classify', { task });
      if (res.data.success) {
        setClassifiedStrategy(res.data.strategy);
        setStrategy(res.data.strategy);
      }
    } catch (err) {
      logError('AgentTeamsPage:classify', err);
      showToast('Strategie-Klassifikation fehlgeschlagen', 'error');
    } finally {
      setClassifying(false);
    }
  };

  const handleExecuteStreaming = async () => {
    if (!task.trim()) {
      showToast('Bitte beschreibe die Aufgabe', 'error');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setStreamEvents([]);
    setCurrentAgent(null);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/agents/execute/stream`, {
        method: 'POST',
        headers: getApiFetchHeaders('application/json'),
        body: JSON.stringify({
          task,
          aiContext: context,
          strategy,
          skipReview: strategy === 'write_only' || strategy === 'code_solve' ? skipReview : undefined,
          templateId: selectedTemplate,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      eventSourceRef.current = {
        abort: () => reader.cancel(),
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();

          if (data === '[DONE]') continue;

          try {
            const event: StreamEvent = JSON.parse(data);
            setStreamEvents(prev => [...prev, event]);

            // Update UI based on event type
            if (event.type === 'agent_start' && event.agentRole) {
              setCurrentAgent({
                role: event.agentRole,
                index: event.agentIndex ?? 0,
                total: event.totalAgents ?? 1,
                subTask: event.subTask ?? '',
              });
            } else if (event.type === 'agent_complete' || event.type === 'agent_error') {
              // Agent finished, clear current
            } else if (event.type === 'result') {
              // Final result
              setResult({
                teamId: event.teamId ?? '',
                finalOutput: event.finalOutput ?? '',
                strategy: event.strategy ?? strategy,
                agents: event.agents ?? [],
                stats: event.stats ?? { executionTimeMs: 0, totalTokens: 0, sharedMemoryEntries: 0 },
              });
              setCurrentAgent(null);
              loadHistory();
              setTimeout(() => {
                resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            } else if (event.type === 'error') {
              setError(event.error || 'Unbekannter Fehler');
              setCurrentAgent(null);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logError('AgentTeamsPage:executeStreaming', err);
      // Fallback to non-streaming
      await handleExecuteFallback();
      return;
    } finally {
      setLoading(false);
      setCurrentAgent(null);
      eventSourceRef.current = null;
    }
  };

  // Fallback to regular execution if streaming fails
  const handleExecuteFallback = async () => {
    try {
      const res = await axios.post(
        '/api/agents/execute',
        {
          task,
          aiContext: context,
          strategy,
          skipReview: strategy === 'write_only' || strategy === 'code_solve' ? skipReview : undefined,
        },
        { timeout: 120000 }
      );

      if (res.data.success) {
        setResult(res.data);
        loadHistory();
      } else {
        setError(res.data.error || 'Ausführung fehlgeschlagen');
      }
    } catch (err) {
      logError('AgentTeamsPage:executeFallback', err);
      setError('Aufgabe konnte nicht ausgeführt werden. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTokens = (tokens: { input: number; output: number } | number): string => {
    if (typeof tokens === 'number') return tokens.toLocaleString('de-DE');
    return (tokens.input + tokens.output).toLocaleString('de-DE');
  };

  const handleSaveAsIdea = async (executionId: string) => {
    setSavingIdeaId(executionId);
    try {
      const res = await axios.post(`/api/agents/history/${executionId}/save-as-idea`, { context });
      if (res.data.success) {
        showToast('Als Gedanke gespeichert', 'success');
        loadHistory();
      }
    } catch (err) {
      logError('AgentTeamsPage:saveAsIdea', err);
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setSavingIdeaId(null);
    }
  };

  const applyTemplate = (template: AgentTemplate) => {
    setSelectedTemplate(template.id);
    setStrategy(template.strategy as Strategy);
    if (template.skipReview !== undefined) setSkipReview(template.skipReview);
    setShowTemplates(false);
    showToast(`Template "${template.name}" angewendet`, 'success');
  };

  // ─── Render Helpers ─────────────────────────────────────────────────────

  const renderTeamsTab = () => (
    <>
      {/* Analytics Panel */}
      {showAnalytics && analytics && (
        <div className="agent-analytics liquid-glass neuro-stagger-item">
          <h3>Agent Analytics (letzte 30 Tage)</h3>
          <div className="analytics-totals">
            <div className="analytics-stat">
              <span className="analytics-stat-value">{analytics.totals.executions}</span>
              <span className="analytics-stat-label">Ausführungen</span>
            </div>
            <div className="analytics-stat">
              <span className="analytics-stat-value analytics-success">{analytics.totals.successRate}%</span>
              <span className="analytics-stat-label">Erfolgsrate</span>
            </div>
            <div className="analytics-stat">
              <span className="analytics-stat-value">{analytics.totals.tokens.toLocaleString('de-DE')}</span>
              <span className="analytics-stat-label">Tokens gesamt</span>
            </div>
          </div>
          {analytics.byStrategy.length > 0 && (
            <div className="analytics-strategies">
              {analytics.byStrategy.map(s => (
                <div key={s.strategy} className="analytics-strategy-row">
                  <span className="strategy-name">
                    {STRATEGIES.find(st => st.id === s.strategy)?.icon || '🤖'}{' '}
                    {STRATEGIES.find(st => st.id === s.strategy)?.label || s.strategy}
                  </span>
                  <span className="strategy-stats">
                    {s.count}x | {formatDuration(s.avgExecutionTime)} avg | ~{s.avgTokens.toLocaleString('de-DE')} Tokens
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Templates Section */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <div className="section-header-row">
          <h3>Aufgabe beschreiben</h3>
          <button
            type="button"
            className="templates-toggle neuro-hover-lift"
            onClick={() => setShowTemplates(!showTemplates)}
          >
            {showTemplates ? '✕ Schließen' : '📋 Templates'}
          </button>
        </div>

        {showTemplates && templates.length > 0 && (
          <div className="templates-grid neuro-stagger-item">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`template-card neuro-hover-lift ${selectedTemplate === t.id ? 'active' : ''}`}
                onClick={() => applyTemplate(t)}
              >
                <span className="template-icon">{t.icon}</span>
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        )}

        <textarea
          className="agent-task-input liquid-glass-input"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Beschreibe die Aufgabe, die das Agent-Team bearbeiten soll..."
          rows={4}
          disabled={loading}
          aria-label="Aufgabenbeschreibung für Agent-Team"
        />
        <div className="task-actions">
          <button
            type="button"
            className="classify-btn neuro-hover-lift neuro-focus-ring"
            onClick={handleClassify}
            disabled={!task.trim() || classifying || loading}
          >
            {classifying ? 'Analysiere...' : '🔎 Strategie erkennen'}
          </button>
          {classifiedStrategy && (
            <span className="classified-badge neuro-stagger-item">
              Empfohlen: {STRATEGIES.find(s => s.id === classifiedStrategy)?.label || classifiedStrategy}
            </span>
          )}
          {selectedTemplate && (
            <span className="template-badge neuro-stagger-item">
              📋 {templates.find(t => t.id === selectedTemplate)?.name}
              <button
                type="button"
                className="clear-template"
                onClick={() => setSelectedTemplate(null)}
              >
                ✕
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Strategy Selection */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <h3>Strategie wählen</h3>
        <div className="strategy-grid">
          {STRATEGIES.map((s, index) => (
            <button
              key={s.id}
              type="button"
              className={`strategy-card neuro-hover-lift neuro-stagger-item ${strategy === s.id ? 'active' : ''}`}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => setStrategy(s.id)}
              disabled={loading}
            >
              <span className="strategy-icon">{s.icon}</span>
              <span className="strategy-label">{s.label}</span>
              <span className="strategy-desc">{s.desc}</span>
            </button>
          ))}
        </div>
        {(strategy === 'write_only' || strategy === 'code_solve') && (
          <label className="skip-review-toggle neuro-stagger-item">
            <input
              type="checkbox"
              checked={skipReview}
              onChange={(e) => setSkipReview(e.target.checked)}
              disabled={loading}
            />
            <span>Review überspringen</span>
          </label>
        )}
      </div>

      {/* Execute Button */}
      <button
        type="button"
        className="execute-btn neuro-button neuro-stagger-item"
        onClick={handleExecuteStreaming}
        disabled={loading || !task.trim()}
      >
        {loading ? (
          <>
            <span className="loading-spinner" />
            Agents arbeiten...
          </>
        ) : (
          <>🚀 Aufgabe starten</>
        )}
      </button>

      {/* Streaming Progress */}
      {loading && (
        <div className="streaming-progress liquid-glass neuro-stagger-item">
          {currentAgent ? (
            <div className="current-agent-progress">
              <div className="progress-header">
                <span className="progress-agent-icon">
                  {ROLE_CONFIG[currentAgent.role]?.icon || '🤖'}
                </span>
                <span className="progress-agent-label">
                  {ROLE_CONFIG[currentAgent.role]?.label || currentAgent.role}
                </span>
                <span className="progress-step">
                  Schritt {currentAgent.index + 1} / {currentAgent.total}
                </span>
              </div>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${((currentAgent.index + 0.5) / currentAgent.total) * 100}%` }}
                />
              </div>
              {currentAgent.subTask && (
                <p className="progress-subtask">{currentAgent.subTask}</p>
              )}
            </div>
          ) : (
            <div className="progress-init">
              <span className="loading-spinner" />
              <span>Aufgabe wird zerlegt und Pipeline vorbereitet...</span>
            </div>
          )}

          {/* Completed agents during streaming */}
          {streamEvents
            .filter(e => e.type === 'agent_complete' || e.type === 'agent_error')
            .map((e, i) => {
              const config = ROLE_CONFIG[e.agentRole || ''] || { icon: '🤖', label: e.agentRole || 'Agent', color: '#888' };
              return (
                <div key={`${e.agentRole || 'agent'}-${i}`} className={`stream-agent-done ${e.type === 'agent_complete' ? 'success' : 'failed'}`}>
                  <span>{config.icon} {config.label}</span>
                  <span className={e.type === 'agent_complete' ? 'done-success' : 'done-failed'}>
                    {e.type === 'agent_complete' ? '✓' : '✗'}
                  </span>
                  {e.result?.executionTimeMs && (
                    <span className="done-time">{formatDuration(e.result.executionTimeMs)}</span>
                  )}
                  {e.result?.toolsUsed && e.result.toolsUsed.length > 0 && (
                    <span className="done-tools">{e.result.toolsUsed.join(', ')}</span>
                  )}
                </div>
              );
            })}

          <p className="loading-hint">Drücke Escape zum Abbrechen</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="agent-error liquid-glass neuro-stagger-item">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="agent-results" ref={resultRef}>
          {/* Execution Stats */}
          <div className="execution-stats liquid-glass neuro-stagger-item">
            <div className="stat-item">
              <span className="stat-label">Strategie</span>
              <span className="stat-value">
                {STRATEGIES.find(s => s.id === result.strategy)?.label || result.strategy}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Dauer</span>
              <span className="stat-value">{formatDuration(result.stats.executionTimeMs)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Tokens</span>
              <span className="stat-value">{formatTokens(result.stats.totalTokens)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Shared Memory</span>
              <span className="stat-value">{result.stats.sharedMemoryEntries} Einträge</span>
            </div>
          </div>

          {/* Per-Agent Results */}
          <div className="agent-cards">
            {result.agents.map((agent, index) => {
              const config = ROLE_CONFIG[agent.role] || { icon: '🤖', label: agent.role, color: '#888' };
              return (
                <div
                  key={`${agent.role}-${index}`}
                  className={`agent-card liquid-glass neuro-hover-lift neuro-stagger-item ${agent.success ? 'success' : 'failed'}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="agent-card-header">
                    <span className="agent-role-icon">{config.icon}</span>
                    <span className="agent-role-label">{config.label}</span>
                    <span className={`agent-status-badge ${agent.success ? 'success' : 'failed'}`}>
                      {agent.success ? '✓ Erfolgreich' : '✗ Fehler'}
                    </span>
                  </div>
                  <div className="agent-card-meta">
                    <span className="agent-duration">{formatDuration(agent.executionTimeMs)}</span>
                    {agent.toolsUsed.length > 0 && (
                      <span className="agent-tools">
                        Tools: {agent.toolsUsed.join(', ')}
                      </span>
                    )}
                  </div>
                  {agent.error && (
                    <div className="agent-error-detail">{agent.error}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Final Output */}
          <div className="final-output liquid-glass neuro-stagger-item">
            <h3>Ergebnis</h3>
            <div className="final-output-content">
              {result.finalOutput}
            </div>
          </div>

          {/* New Task Button */}
          <button
            type="button"
            className="new-task-btn neuro-hover-lift neuro-focus-ring"
            onClick={() => {
              setResult(null);
              setTask('');
              setClassifiedStrategy(null);
              setSelectedTemplate(null);
              setError(null);
              setStreamEvents([]);
            }}
          >
            + Neue Aufgabe
          </button>
        </div>
      )}

      {/* History Section */}
      {history.length > 0 && (
        <div className="agent-history-section neuro-stagger-item">
          <h3>Verlauf</h3>
          <div className="history-list">
            {history.map((entry) => (
              <div
                key={entry.id}
                className={`history-card liquid-glass neuro-hover-lift ${expandedHistoryId === entry.id ? 'expanded' : ''}`}
              >
                <button
                  type="button"
                  className="history-card-header"
                  onClick={() => setExpandedHistoryId(expandedHistoryId === entry.id ? null : entry.id)}
                >
                  {entry.status && entry.status !== 'completed' && entry.status !== 'failed' ? (
                    <span
                      className="history-status-badge"
                      style={{ background: `${EXECUTION_STATUS_LABELS[entry.status]?.color || '#888'}22`, color: EXECUTION_STATUS_LABELS[entry.status]?.color || '#888' }}
                    >
                      {EXECUTION_STATUS_LABELS[entry.status]?.label || entry.status}
                    </span>
                  ) : (
                    <span className={`history-status ${entry.success ? 'success' : 'failed'}`}>
                      {entry.success ? '✓' : '✗'}
                    </span>
                  )}
                  <span className="history-task">{entry.task.substring(0, 80)}{entry.task.length > 80 ? '...' : ''}</span>
                  <span className="history-meta">
                    {STRATEGIES.find(s => s.id === entry.strategy)?.icon || '🤖'}{' '}
                    {formatDuration(entry.executionTimeMs)}
                  </span>
                  <span className="history-date">
                    {new Date(entry.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
                {expandedHistoryId === entry.id && (
                  <div className="history-card-body">
                    {entry.pauseReason && (
                      <div className="history-pause-reason">
                        Pausiert: {entry.pauseReason}
                      </div>
                    )}
                    {entry.checkpointStep != null && entry.checkpointStep > 0 && (
                      <div className="history-checkpoint-info">
                        Checkpoint bei Schritt {entry.checkpointStep}
                      </div>
                    )}
                    <div className="history-output">{entry.finalOutput}</div>
                    <div className="history-actions">
                      {(entry.status === 'running') && (
                        <>
                          <button
                            type="button"
                            className="agent-control-btn pause-btn"
                            onClick={() => handlePauseExecution(entry.id)}
                          >
                            Pausieren
                          </button>
                          <button
                            type="button"
                            className="agent-control-btn cancel-btn"
                            onClick={() => handleCancelExecution(entry.id)}
                          >
                            Abbrechen
                          </button>
                        </>
                      )}
                      {(entry.status === 'paused' || entry.status === 'awaiting_approval') && (
                        <button
                          type="button"
                          className="agent-control-btn cancel-btn"
                          onClick={() => handleCancelExecution(entry.id)}
                        >
                          Abbrechen
                        </button>
                      )}
                      {entry.status === 'awaiting_approval' && (
                        <span className="governance-link-hint">
                          Genehmigung in Einstellungen &rarr; Governance
                        </span>
                      )}
                      {!entry.savedAsIdeaId && entry.finalOutput && (
                        <button
                          type="button"
                          className="save-idea-btn neuro-hover-lift"
                          onClick={() => handleSaveAsIdea(entry.id)}
                          disabled={savingIdeaId === entry.id}
                        >
                          {savingIdeaId === entry.id ? 'Speichere...' : '💡 Als Gedanke speichern'}
                        </button>
                      )}
                      {entry.savedAsIdeaId && (
                        <span className="saved-badge">💡 Gespeichert</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const renderIdentitiesTab = () => (
    <>
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <div className="section-header-row">
          <h3>Agent-Identitäten</h3>
          <button
            type="button"
            className="templates-toggle neuro-hover-lift"
            onClick={() => {
              setShowIdentityForm(!showIdentityForm);
              if (showIdentityForm) {
                setEditingIdentity(null);
                resetIdentityForm();
              }
            }}
          >
            {showIdentityForm ? '✕ Schließen' : '+ Neuer Agent'}
          </button>
        </div>

        {showIdentityForm && (
          <div className="agent-teams-section" style={{ padding: '1rem', marginBottom: '1rem', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              {editingIdentity ? 'Agent bearbeiten' : 'Neuen Agent erstellen'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
                value={identityForm.name}
                onChange={(e) => setIdentityForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Name des Agents"
              />
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <select
                  className="agent-task-input liquid-glass-input"
                  style={{ minHeight: 'auto', padding: '0.6rem 0.8rem', flex: '1 1 140px' }}
                  value={identityForm.role}
                  onChange={(e) => setIdentityForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="researcher">Researcher</option>
                  <option value="writer">Writer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="coder">Coder</option>
                  <option value="assistant">Assistant</option>
                  <option value="analyst">Analyst</option>
                </select>
                <select
                  className="agent-task-input liquid-glass-input"
                  style={{ minHeight: 'auto', padding: '0.6rem 0.8rem', flex: '1 1 140px' }}
                  value={identityForm.trust_level}
                  onChange={(e) => setIdentityForm(f => ({ ...f, trust_level: e.target.value as 'low' | 'medium' | 'high' }))}
                >
                  <option value="low">Vertrauen: Niedrig</option>
                  <option value="medium">Vertrauen: Mittel</option>
                  <option value="high">Vertrauen: Hoch</option>
                </select>
              </div>
              <textarea
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: '60px' }}
                value={identityForm.description}
                onChange={(e) => setIdentityForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Beschreibung (optional)"
                rows={2}
              />
              <input
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
                value={identityForm.persona_tone}
                onChange={(e) => setIdentityForm(f => ({ ...f, persona_tone: e.target.value }))}
                placeholder="Tonfall (z.B. professionell, freundlich)"
              />
              <input
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
                value={identityForm.persona_expertise}
                onChange={(e) => setIdentityForm(f => ({ ...f, persona_expertise: e.target.value }))}
                placeholder="Expertise (kommagetrennt, z.B. TypeScript, React)"
              />
              <input
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
                value={identityForm.permissions}
                onChange={(e) => setIdentityForm(f => ({ ...f, permissions: e.target.value }))}
                placeholder="Berechtigungen (kommagetrennt, z.B. tools.*, data.emails)"
              />
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <label className="skip-review-toggle" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={identityForm.enabled}
                    onChange={(e) => setIdentityForm(f => ({ ...f, enabled: e.target.checked }))}
                  />
                  <span>Aktiviert</span>
                </label>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="execute-btn neuro-button"
                  style={{ width: 'auto', padding: '0.6rem 1.5rem', margin: 0 }}
                  onClick={handleSaveIdentity}
                  disabled={!identityForm.name.trim()}
                >
                  {editingIdentity ? 'Aktualisieren' : 'Erstellen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {identitiesLoading ? (
          <div className="progress-init">
            <span className="loading-spinner" />
            <span>Lade Agenten...</span>
          </div>
        ) : identities.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
            Noch keine Agent-Identitäten erstellt.
          </p>
        ) : (
          <div className="agent-cards">
            {identities.map((identity, index) => {
              const roleConfig = ROLE_CONFIG[identity.role] || { icon: '🤖', label: identity.role, color: '#888' };
              const trustConfig = TRUST_LEVEL_CONFIG[identity.trust_level] || { label: identity.trust_level, color: '#888' };
              return (
                <div
                  key={identity.id}
                  className={`agent-card liquid-glass neuro-hover-lift neuro-stagger-item ${identity.enabled ? 'success' : 'failed'}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="agent-card-header">
                    <span className="agent-role-icon">{roleConfig.icon}</span>
                    <span className="agent-role-label">{identity.name}</span>
                    <span
                      className="agent-status-badge"
                      style={{ background: `${trustConfig.color}22`, color: trustConfig.color }}
                    >
                      {trustConfig.label}
                    </span>
                    <span className={`agent-status-badge ${identity.enabled ? 'success' : 'failed'}`}>
                      {identity.enabled ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>
                  <div className="agent-card-meta">
                    <span>{roleConfig.label}</span>
                    {identity.description && <span>{identity.description}</span>}
                    {identity.persona?.expertise && identity.persona.expertise.length > 0 && (
                      <span>Expertise: {identity.persona.expertise.join(', ')}</span>
                    )}
                  </div>
                  <div className="history-actions" style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="save-idea-btn neuro-hover-lift"
                      onClick={() => handleEditIdentity(identity)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="agent-control-btn cancel-btn"
                      onClick={() => handleDeleteIdentity(identity.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  const renderWorkflowsTab = () => (
    <>
      {/* Saved Workflows */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <h3>Gespeicherte Workflows</h3>
        {workflowsLoading ? (
          <div className="progress-init">
            <span className="loading-spinner" />
            <span>Lade Workflows...</span>
          </div>
        ) : workflows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>
            Keine gespeicherten Workflows. Erstelle einen aus den Templates unten.
          </p>
        ) : (
          <div className="history-list">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className={`history-card liquid-glass neuro-hover-lift ${expandedWorkflowId === wf.id ? 'expanded' : ''}`}
              >
                <button
                  type="button"
                  className="history-card-header"
                  onClick={() => setExpandedWorkflowId(expandedWorkflowId === wf.id ? null : wf.id)}
                >
                  <span className="history-status success">🔄</span>
                  <span className="history-task">{wf.name}</span>
                  <span className="history-meta">
                    {wf.nodes.length} Nodes
                  </span>
                  <span className="history-date">
                    {new Date(wf.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                  </span>
                </button>
                {expandedWorkflowId === wf.id && (
                  <div className="history-card-body">
                    {wf.description && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
                        {wf.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '0.75rem' }}>
                      {wf.nodes.map((node) => (
                        <span
                          key={node.id}
                          className="classified-badge"
                          style={{ fontSize: '0.75rem' }}
                        >
                          {node.type === 'agent' ? '🤖' : node.type === 'tool' ? '🔧' : node.type === 'condition' ? '❓' : '👤'} {node.id}
                        </span>
                      ))}
                    </div>
                    <div className="history-actions">
                      <button
                        type="button"
                        className="execute-btn neuro-button"
                        style={{ width: 'auto', padding: '0.5rem 1.25rem', margin: 0, fontSize: '0.85rem' }}
                        onClick={() => handleExecuteWorkflow(wf.id)}
                        disabled={executingWorkflowId === wf.id}
                      >
                        {executingWorkflowId === wf.id ? 'Wird gestartet...' : '🚀 Ausführen'}
                      </button>
                      <button
                        type="button"
                        className="agent-control-btn cancel-btn"
                        onClick={() => handleDeleteWorkflow(wf.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workflow Templates */}
      {workflowTemplates.length > 0 && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item">
          <h3>Workflow-Templates</h3>
          <div className="templates-grid">
            {workflowTemplates.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                className="template-card neuro-hover-lift"
                onClick={() => handleSaveTemplateAsWorkflow(tmpl)}
              >
                <span className="template-icon">🔄</span>
                <span className="template-name">{tmpl.name}</span>
                <span className="template-desc">{tmpl.description}</span>
                <span className="template-desc" style={{ marginTop: '4px', opacity: 0.7 }}>
                  {tmpl.nodes.length} Schritte
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Runs */}
      {workflowRuns.length > 0 && (
        <div className="agent-history-section neuro-stagger-item">
          <h3>Ausführungsverlauf</h3>
          <div className="history-list">
            {workflowRuns.map((run) => {
              const statusConfig = EXECUTION_STATUS_LABELS[run.status] || { label: run.status, color: '#888' };
              return (
                <div key={run.id} className="history-card liquid-glass neuro-hover-lift">
                  <div className="history-card-header" style={{ cursor: 'default' }}>
                    <span
                      className="history-status-badge"
                      style={{ background: `${statusConfig.color}22`, color: statusConfig.color }}
                    >
                      {statusConfig.label}
                    </span>
                    <span className="history-task">
                      {run.workflow_name || run.workflow_id}
                    </span>
                    <span className="history-date">
                      {new Date(run.started_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {run.error && (
                    <div className="history-card-body">
                      <div className="agent-error-detail">{run.error}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  const renderA2ATab = () => (
    <>
      {/* External Agents */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item">
        <div className="section-header-row">
          <h3>Externe Agenten</h3>
          <button
            type="button"
            className="templates-toggle neuro-hover-lift"
            onClick={() => setShowRegisterAgent(!showRegisterAgent)}
          >
            {showRegisterAgent ? '✕ Schließen' : '+ Agent registrieren'}
          </button>
        </div>

        {showRegisterAgent && (
          <div style={{ padding: '1rem', marginBottom: '1rem', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
                value={registerForm.name}
                onChange={(e) => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Agent-Name"
              />
              <input
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
                value={registerForm.url}
                onChange={(e) => setRegisterForm(f => ({ ...f, url: e.target.value }))}
                placeholder="Agent-URL (z.B. https://agent.example.com)"
              />
              <input
                className="agent-task-input liquid-glass-input"
                style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
                value={registerForm.description}
                onChange={(e) => setRegisterForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Beschreibung (optional)"
              />
              <button
                type="button"
                className="execute-btn neuro-button"
                style={{ padding: '0.6rem', margin: 0 }}
                onClick={handleRegisterAgent}
                disabled={!registerForm.name.trim() || !registerForm.url.trim()}
              >
                Registrieren
              </button>
            </div>
          </div>
        )}

        {a2aLoading ? (
          <div className="progress-init">
            <span className="loading-spinner" />
            <span>Lade externe Agenten...</span>
          </div>
        ) : externalAgents.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
            Keine externen Agenten registriert.
          </p>
        ) : (
          <div className="agent-cards">
            {externalAgents.map((agent, index) => (
              <div
                key={agent.id}
                className={`agent-card liquid-glass neuro-hover-lift neuro-stagger-item ${agent.healthy ? 'success' : 'failed'}`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="agent-card-header">
                  <span className="agent-role-icon">🌐</span>
                  <span className="agent-role-label">{agent.name}</span>
                  <span className={`agent-status-badge ${agent.healthy ? 'success' : 'failed'}`}>
                    {agent.healthy ? 'Erreichbar' : 'Offline'}
                  </span>
                </div>
                <div className="agent-card-meta">
                  <span style={{ wordBreak: 'break-all' }}>{agent.url}</span>
                  {agent.description && <span>{agent.description}</span>}
                  {agent.skills && agent.skills.length > 0 && (
                    <span>Skills: {agent.skills.join(', ')}</span>
                  )}
                  {agent.last_health_check && (
                    <span>
                      Letzter Check: {new Date(agent.last_health_check).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Send Task Form (inline) */}
                {sendingTaskAgentId === agent.id && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '8px' }}>
                    <input
                      className="agent-task-input liquid-glass-input"
                      style={{ minHeight: 'auto', padding: '0.5rem 0.75rem', flex: 1 }}
                      value={sendTaskForm.task}
                      onChange={(e) => setSendTaskForm({ task: e.target.value })}
                      placeholder="Aufgabe beschreiben..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && sendTaskForm.task.trim()) handleSendTask(agent.id);
                      }}
                    />
                    <button
                      type="button"
                      className="execute-btn neuro-button"
                      style={{ width: 'auto', padding: '0.5rem 1rem', margin: 0, fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                      onClick={() => handleSendTask(agent.id)}
                      disabled={!sendTaskForm.task.trim()}
                    >
                      Senden
                    </button>
                  </div>
                )}

                <div className="history-actions" style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="save-idea-btn neuro-hover-lift"
                    onClick={() => {
                      if (sendingTaskAgentId === agent.id) {
                        setSendingTaskAgentId(null);
                        setSendTaskForm({ task: '' });
                      } else {
                        setSendingTaskAgentId(agent.id);
                      }
                    }}
                  >
                    {sendingTaskAgentId === agent.id ? '✕ Abbrechen' : '📤 Aufgabe senden'}
                  </button>
                  <button
                    type="button"
                    className="save-idea-btn neuro-hover-lift"
                    onClick={() => handleHealthCheck(agent.id)}
                    disabled={checkingHealthId === agent.id}
                  >
                    {checkingHealthId === agent.id ? 'Prüfe...' : '🏥 Health Check'}
                  </button>
                  <button
                    type="button"
                    className="agent-control-btn cancel-btn"
                    onClick={() => handleRemoveAgent(agent.id)}
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* A2A Tasks */}
      {a2aTasks.length > 0 && (
        <div className="agent-history-section neuro-stagger-item">
          <h3>A2A Aufgaben</h3>
          <div className="history-list">
            {a2aTasks.map((atask) => {
              const statusConfig = EXECUTION_STATUS_LABELS[atask.status] || {
                label: atask.status === 'submitted' ? 'Gesendet' :
                       atask.status === 'working' ? 'In Arbeit' :
                       atask.status === 'completed' ? 'Abgeschlossen' :
                       atask.status === 'canceled' ? 'Abgebrochen' :
                       atask.status,
                color: atask.status === 'submitted' ? '#3b82f6' :
                       atask.status === 'working' ? '#f59e0b' :
                       atask.status === 'completed' ? '#22c55e' :
                       atask.status === 'canceled' ? '#9ca3af' :
                       '#ef4444',
              };
              return (
                <div key={atask.id} className="history-card liquid-glass neuro-hover-lift">
                  <div className="history-card-header" style={{ cursor: 'default' }}>
                    <span
                      className="history-status-badge"
                      style={{ background: `${statusConfig.color}22`, color: statusConfig.color }}
                    >
                      {statusConfig.label}
                    </span>
                    <span className="history-task">
                      {atask.task_description?.substring(0, 80) || 'Keine Beschreibung'}
                      {(atask.task_description?.length || 0) > 80 ? '...' : ''}
                    </span>
                    {atask.agent_name && (
                      <span className="history-meta">🌐 {atask.agent_name}</span>
                    )}
                    <span className="history-date">
                      {new Date(atask.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {(atask.result || atask.error) && (
                    <div className="history-card-body">
                      {atask.result && <div className="history-output">{atask.result}</div>}
                      {atask.error && <div className="agent-error-detail">{atask.error}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  // ─── Main Render ────────────────────────────────────────────────────────

  return (
    <div className="agent-teams-page neuro-page-enter">
      {!embedded && (
        <div className="agent-teams-header liquid-glass-nav">
          <button className="back-button neuro-hover-lift" onClick={onBack} type="button">
            ← Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Agent Teams</h1>
            <span className="greeting-subtext neuro-subtext-emotional">
              Multi-Agent Aufgaben orchestrieren
            </span>
          </div>
          <button
            type="button"
            className="analytics-toggle-btn neuro-hover-lift"
            onClick={() => {
              setShowAnalytics(!showAnalytics);
              if (!analytics) loadAnalytics();
            }}
            aria-label="Analytics anzeigen"
            aria-expanded={showAnalytics}
            title="Analytics (letzte 30 Tage)"
          >
            📊
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="strategy-grid" style={{ marginBottom: '1.5rem' }}>
        {AGENT_TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            className={`strategy-card neuro-hover-lift ${activeTab === tab.id ? 'active' : ''}`}
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="strategy-icon">{tab.icon}</span>
            <span className="strategy-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'teams' && renderTeamsTab()}
      {activeTab === 'identities' && renderIdentitiesTab()}
      {activeTab === 'workflows' && renderWorkflowsTab()}
      {activeTab === 'a2a' && renderA2ATab()}
    </div>
  );
}
