/**
 * WorkflowPanel - Workflow Graph Visualization (Phase 64+)
 *
 * Visual graph display for agent workflows with:
 * - List of saved workflows + templates
 * - CSS-based node graph visualization (no reactflow dependency)
 * - Node types: agent (blue), tool (green), condition (yellow diamond), human_review (orange)
 * - Execute workflow with result display
 * - Recent runs list with status
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { logError } from '../utils/errors';
import { showToast } from './Toast';
import './WorkflowPanel.css';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  graph?: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    entry_node?: string;
  };
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

// ─── Constants ──────────────────────────────────────────────────────────────

const NODE_TYPE_CONFIG: Record<string, { label: string; icon: string; colorVar: string; className: string }> = {
  agent:        { label: 'Agent',           icon: 'A', colorVar: '#3b82f6', className: 'wfg-node--agent' },
  tool:         { label: 'Tool',            icon: 'T', colorVar: '#22c55e', className: 'wfg-node--tool' },
  condition:    { label: 'Bedingung',       icon: '?', colorVar: '#eab308', className: 'wfg-node--condition' },
  human_review: { label: 'Manuelle Pruefung', icon: 'H', colorVar: '#f97316', className: 'wfg-node--human-review' },
};

const RUN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  running:            { label: 'Laeuft',            className: 'wfp-run--running' },
  completed:          { label: 'Abgeschlossen',     className: 'wfp-run--completed' },
  failed:             { label: 'Fehlgeschlagen',     className: 'wfp-run--failed' },
  paused:             { label: 'Pausiert',           className: 'wfp-run--paused' },
  awaiting_approval:  { label: 'Genehmigung noetig', className: 'wfp-run--paused' },
  cancelled:          { label: 'Abgebrochen',        className: 'wfp-run--cancelled' },
};

// ─── Graph Layout Helpers ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
  col: number;
  row: number;
}

/**
 * Simple topological layout: assigns each node a column (depth from entry)
 * and a row (index among siblings at that depth).
 */
function layoutNodes(nodes: WorkflowNode[], edges: WorkflowEdge[], entryNode?: string): LayoutNode[] {
  if (nodes.length === 0) return [];

  // Build adjacency
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  }

  // Find entry nodes (in-degree 0 or explicit entry_node)
  let queue: string[] = [];
  if (entryNode && nodes.some(n => n.id === entryNode)) {
    queue = [entryNode];
  } else {
    queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
  }
  if (queue.length === 0) {
    queue = [nodes[0].id];
  }

  const visited = new Set<string>();
  const colAssign = new Map<string, number>();
  const colNodes = new Map<number, string[]>();

  // BFS to assign columns
  let bfsQueue = queue.map(id => ({ id, col: 0 }));
  while (bfsQueue.length > 0) {
    const next: typeof bfsQueue = [];
    for (const { id, col } of bfsQueue) {
      if (visited.has(id)) continue;
      visited.add(id);
      colAssign.set(id, col);
      if (!colNodes.has(col)) colNodes.set(col, []);
      colNodes.get(col)!.push(id);

      for (const neighbor of adj.get(id) || []) {
        if (!visited.has(neighbor)) {
          next.push({ id: neighbor, col: col + 1 });
        }
      }
    }
    bfsQueue = next;
  }

  // Any unvisited nodes get placed at the end
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const col = (colNodes.size > 0 ? Math.max(...colNodes.keys()) + 1 : 0);
      colAssign.set(n.id, col);
      if (!colNodes.has(col)) colNodes.set(col, []);
      colNodes.get(col)!.push(n.id);
    }
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const result: LayoutNode[] = [];

  for (const [col, ids] of colNodes) {
    ids.forEach((id, row) => {
      const node = nodeMap.get(id);
      if (node) {
        result.push({ ...node, col, row });
      }
    });
  }

  return result;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function WorkflowGraphView({
  nodes,
  edges,
  entryNode,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entryNode?: string;
}) {
  const layoutResult = useMemo(() => layoutNodes(nodes, edges, entryNode), [nodes, edges, entryNode]);

  if (layoutResult.length === 0) {
    return <div className="wfg-empty">Keine Knoten vorhanden</div>;
  }

  const maxCol = Math.max(...layoutResult.map(n => n.col));
  const colRowCounts = new Map<number, number>();
  for (const n of layoutResult) {
    colRowCounts.set(n.col, Math.max(colRowCounts.get(n.col) || 0, n.row + 1));
  }
  const maxRows = Math.max(...colRowCounts.values());

  // Position calculations
  const NODE_W = 140;
  const NODE_H = 60;
  const COL_GAP = 80;
  const ROW_GAP = 40;
  const PAD = 24;

  const totalW = (maxCol + 1) * NODE_W + maxCol * COL_GAP + PAD * 2;
  const totalH = maxRows * NODE_H + (maxRows - 1) * ROW_GAP + PAD * 2;

  const getNodePos = (col: number, row: number, rowsInCol: number) => {
    const x = PAD + col * (NODE_W + COL_GAP);
    const colHeight = rowsInCol * NODE_H + (rowsInCol - 1) * ROW_GAP;
    const yOffset = (totalH - colHeight) / 2;
    const y = yOffset + row * (NODE_H + ROW_GAP);
    return { x, y };
  };

  // Build position map
  const posMap = new Map<string, { x: number; y: number }>();
  for (const n of layoutResult) {
    const rowsInCol = colRowCounts.get(n.col) || 1;
    posMap.set(n.id, getNodePos(n.col, n.row, rowsInCol));
  }

  return (
    <div className="wfg-container">
      <div className="wfg-canvas" style={{ width: totalW, height: totalH, minWidth: totalW, minHeight: totalH }}>
        {/* SVG edges */}
        <svg className="wfg-edges-svg" width={totalW} height={totalH}>
          <defs>
            <marker
              id="wfg-arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="var(--text-secondary, #888)" />
            </marker>
          </defs>
          {edges.map((edge, i) => {
            const from = posMap.get(edge.from);
            const to = posMap.get(edge.to);
            if (!from || !to) return null;

            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;

            // Bezier curve
            const cx1 = x1 + (x2 - x1) * 0.4;
            const cx2 = x2 - (x2 - x1) * 0.4;

            return (
              <g key={`edge-${i}`}>
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                  className="wfg-edge-path"
                  markerEnd="url(#wfg-arrowhead)"
                />
                {edge.condition && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 8}
                    className="wfg-edge-label"
                    textAnchor="middle"
                  >
                    {edge.condition}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {layoutResult.map(node => {
          const pos = posMap.get(node.id);
          if (!pos) return null;

          const cfg = NODE_TYPE_CONFIG[node.type] || NODE_TYPE_CONFIG.agent;
          const isCondition = node.type === 'condition';
          const displayName = (node.config?.role as string) || (node.config?.name as string) || node.id;

          return (
            <div
              key={node.id}
              className={`wfg-node ${cfg.className} ${isCondition ? 'wfg-node--diamond' : ''}`}
              style={{
                left: pos.x,
                top: pos.y,
                width: NODE_W,
                height: NODE_H,
              }}
              title={`${cfg.label}: ${displayName}`}
            >
              <span className="wfg-node-icon">{cfg.icon}</span>
              <span className="wfg-node-label">{displayName}</span>
              <span className="wfg-node-type">{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface WorkflowPanelProps {
  context: string;
}

export function WorkflowPanel({ context: _context }: WorkflowPanelProps) {
  void _context; // reserved for future context-specific workflow filtering
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'templates'>('list');

  // ─── Data Loading ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
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
      logError('WorkflowPanel:loadData', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleSaveTemplate = async (template: WorkflowTemplate) => {
    try {
      await axios.post('/api/agent-workflows', {
        name: template.name,
        description: template.description,
        nodes: template.nodes,
        edges: template.edges,
      });
      showToast(`Workflow "${template.name}" gespeichert`, 'success');
      await loadData();
    } catch (err) {
      logError('WorkflowPanel:saveTemplate', err);
      showToast('Fehler beim Speichern', 'error');
    }
  };

  const handleExecute = async (workflowId: string) => {
    setExecutingId(workflowId);
    setExecutionResult(null);
    try {
      const res = await axios.post(`/api/agent-workflows/${workflowId}/execute`);
      if (res.data.success) {
        showToast('Workflow gestartet', 'success');
        setExecutionResult(
          typeof res.data.data?.result === 'string'
            ? res.data.data.result
            : res.data.data?.status || 'Workflow gestartet'
        );
        await loadData();
      } else {
        showToast(res.data.error || 'Fehler beim Starten', 'error');
      }
    } catch (err) {
      logError('WorkflowPanel:execute', err);
      showToast('Fehler beim Starten', 'error');
    } finally {
      setExecutingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Workflow wirklich loeschen?')) return;
    try {
      await axios.delete(`/api/agent-workflows/${id}`);
      showToast('Workflow geloescht', 'success');
      if (selectedWorkflow?.id === id) setSelectedWorkflow(null);
      await loadData();
    } catch (err) {
      logError('WorkflowPanel:delete', err);
      showToast('Fehler beim Loeschen', 'error');
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────

  const getNodes = (wf: WorkflowDefinition): WorkflowNode[] => wf.graph?.nodes || wf.nodes || [];
  const getEdges = (wf: WorkflowDefinition): WorkflowEdge[] => wf.graph?.edges || wf.edges || [];
  const getEntry = (wf: WorkflowDefinition): string | undefined => wf.graph?.entry_node;

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="wfp-root">
      {/* Header */}
      <div className="wfp-header">
        <div className="wfp-view-toggle">
          <button
            type="button"
            className={`wfp-toggle-btn ${view === 'list' ? 'wfp-toggle-btn--active' : ''}`}
            onClick={() => setView('list')}
          >
            Gespeichert ({workflows.length})
          </button>
          <button
            type="button"
            className={`wfp-toggle-btn ${view === 'templates' ? 'wfp-toggle-btn--active' : ''}`}
            onClick={() => setView('templates')}
          >
            Templates ({workflowTemplates.length})
          </button>
        </div>
      </div>

      {loading && (
        <div className="wfp-loading">
          <span className="loading-spinner" />
          <span>Lade Workflows...</span>
        </div>
      )}

      {/* ─── Saved Workflows List ─────────────────────────────────────── */}
      {!loading && view === 'list' && (
        <div className="wfp-list-area">
          {workflows.length === 0 ? (
            <div className="wfp-empty">
              <p>Keine gespeicherten Workflows.</p>
              <button
                type="button"
                className="wfp-btn wfp-btn--secondary"
                onClick={() => setView('templates')}
              >
                Templates anzeigen
              </button>
            </div>
          ) : (
            <div className="wfp-workflow-list">
              {workflows.map(wf => {
                const nodes = getNodes(wf);
                const isSelected = selectedWorkflow?.id === wf.id;

                return (
                  <div key={wf.id} className={`wfp-workflow-item ${isSelected ? 'wfp-workflow-item--selected' : ''}`}>
                    <button
                      type="button"
                      className="wfp-workflow-header"
                      onClick={() => setSelectedWorkflow(isSelected ? null : wf)}
                    >
                      <div className="wfp-workflow-info">
                        <span className="wfp-workflow-name">{wf.name}</span>
                        <span className="wfp-workflow-meta">
                          {nodes.length} Knoten &middot; {formatDate(wf.created_at)}
                        </span>
                      </div>
                      <div className="wfp-workflow-badges">
                        {nodes.slice(0, 4).map(n => {
                          const cfg = NODE_TYPE_CONFIG[n.type] || NODE_TYPE_CONFIG.agent;
                          return (
                            <span
                              key={n.id}
                              className={`wfp-node-badge ${cfg.className}`}
                              title={`${cfg.label}: ${n.id}`}
                            >
                              {cfg.icon}
                            </span>
                          );
                        })}
                        {nodes.length > 4 && (
                          <span className="wfp-node-badge wfp-node-badge--more">+{nodes.length - 4}</span>
                        )}
                      </div>
                      <span className="wfp-chevron">{isSelected ? '\u25B2' : '\u25BC'}</span>
                    </button>

                    {isSelected && (
                      <div className="wfp-workflow-detail">
                        {wf.description && (
                          <p className="wfp-workflow-desc">{wf.description}</p>
                        )}

                        {/* Graph Visualization */}
                        <WorkflowGraphView
                          nodes={nodes}
                          edges={getEdges(wf)}
                          entryNode={getEntry(wf)}
                        />

                        {/* Actions */}
                        <div className="wfp-workflow-actions">
                          <button
                            type="button"
                            className="wfp-btn wfp-btn--primary"
                            onClick={() => handleExecute(wf.id)}
                            disabled={executingId === wf.id}
                          >
                            {executingId === wf.id ? 'Wird gestartet...' : 'Ausfuehren'}
                          </button>
                          <button
                            type="button"
                            className="wfp-btn wfp-btn--danger"
                            onClick={() => handleDelete(wf.id)}
                          >
                            Loeschen
                          </button>
                        </div>

                        {/* Execution Result */}
                        {executionResult && selectedWorkflow?.id === wf.id && (
                          <div className="wfp-exec-result">
                            <h4>Ergebnis</h4>
                            <pre className="wfp-exec-result-text">{executionResult}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Templates ────────────────────────────────────────────────── */}
      {!loading && view === 'templates' && (
        <div className="wfp-templates-area">
          {workflowTemplates.length === 0 ? (
            <div className="wfp-empty">
              <p>Keine Workflow-Templates verfuegbar.</p>
            </div>
          ) : (
            <div className="wfp-templates-grid">
              {workflowTemplates.map(tmpl => (
                <div key={tmpl.id} className="wfp-template-card">
                  <div className="wfp-template-header">
                    <span className="wfp-template-name">{tmpl.name}</span>
                    <span className="wfp-template-count">{tmpl.nodes.length} Schritte</span>
                  </div>
                  <p className="wfp-template-desc">{tmpl.description}</p>
                  <div className="wfp-template-nodes">
                    {tmpl.nodes.map(n => {
                      const cfg = NODE_TYPE_CONFIG[n.type] || NODE_TYPE_CONFIG.agent;
                      return (
                        <span key={n.id} className={`wfp-node-badge ${cfg.className}`} title={n.id}>
                          {cfg.icon}
                        </span>
                      );
                    })}
                  </div>

                  {/* Mini graph preview */}
                  <WorkflowGraphView nodes={tmpl.nodes} edges={tmpl.edges} />

                  <button
                    type="button"
                    className="wfp-btn wfp-btn--secondary wfp-template-save-btn"
                    onClick={() => handleSaveTemplate(tmpl)}
                  >
                    Als Workflow speichern
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Recent Runs ──────────────────────────────────────────────── */}
      {!loading && workflowRuns.length > 0 && (
        <div className="wfp-runs-section">
          <h3 className="wfp-runs-title">Letzte Ausfuehrungen</h3>
          <div className="wfp-runs-list">
            {workflowRuns.slice(0, 10).map(run => {
              const statusCfg = RUN_STATUS_CONFIG[run.status] || { label: run.status, className: '' };
              return (
                <div key={run.id} className="wfp-run-item">
                  <span className={`wfp-run-status ${statusCfg.className}`}>
                    {statusCfg.label}
                  </span>
                  <span className="wfp-run-name">
                    {run.workflow_name || run.workflow_id}
                  </span>
                  <span className="wfp-run-date">
                    {formatDate(run.started_at)}
                  </span>
                  {run.error && (
                    <span className="wfp-run-error" title={run.error}>
                      Fehler
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkflowPanel;
