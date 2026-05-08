/**
 * WorkflowToolbar — top toolbar with Save, Run, Template load, and Export actions.
 */

import { useState } from 'react';
import { Save, Play, LayoutTemplate, Download } from 'lucide-react';
import type { Node, Edge } from 'reactflow';
import axios from 'axios';
import { logError } from '../../utils/errors';

interface WorkflowToolbarProps {
  workflowId?: string;
  workflowName: string;
  nodes: Node[];
  edges: Edge[];
  onNameChange: (name: string) => void;
  onTemplateLoad: (nodes: Node[], edges: Edge[]) => void;
}

const TEMPLATES: Array<{ name: string; nodes: Node[]; edges: Edge[] }> = [
  {
    name: 'Email → Task',
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 200, y: 60 }, data: { label: 'Neue E-Mail', triggerType: 'event', eventFilter: 'email.received' } },
      { id: 'a1', type: 'action', position: { x: 200, y: 220 }, data: { label: 'Task erstellen', actionType: 'create', targetEntity: 'task' } },
    ],
    edges: [{ id: 'e1', source: 't1', target: 'a1', animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } }],
  },
  {
    name: 'Meeting → Notizen → Tasks',
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 200, y: 60 }, data: { label: 'Meeting beendet', triggerType: 'event', eventFilter: 'meeting.ended' } },
      { id: 'ag1', type: 'agent', position: { x: 200, y: 200 }, data: { label: 'Notizen generieren', blueprint: 'Meeting Prep', model: 'claude-sonnet-4-6' } },
      { id: 'a1', type: 'action', position: { x: 200, y: 360 }, data: { label: 'Tasks erstellen', actionType: 'create', targetEntity: 'task' } },
    ],
    edges: [
      { id: 'e1', source: 't1', target: 'ag1', animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } },
      { id: 'e2', source: 'ag1', target: 'a1', animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } },
    ],
  },
  {
    name: 'Idee → Recherche → Entwurf',
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 200, y: 60 }, data: { label: 'Neue Idee', triggerType: 'event', eventFilter: 'idea.created' } },
      { id: 'ag1', type: 'agent', position: { x: 200, y: 200 }, data: { label: 'Recherchieren', blueprint: 'Researcher', model: 'claude-opus-4-6' } },
      { id: 'ag2', type: 'agent', position: { x: 200, y: 360 }, data: { label: 'Entwurf schreiben', blueprint: 'Writer', model: 'claude-sonnet-4-6' } },
    ],
    edges: [
      { id: 'e1', source: 't1', target: 'ag1', animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } },
      { id: 'e2', source: 'ag1', target: 'ag2', animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } },
    ],
  },
  {
    name: 'Tägliche Zusammenfassung',
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 200, y: 60 }, data: { label: 'Täglich 18:00', triggerType: 'schedule', cron: '0 18 * * 1-5' } },
      { id: 'ag1', type: 'agent', position: { x: 200, y: 200 }, data: { label: 'Digest generieren', blueprint: 'Daily Digest', model: 'claude-sonnet-4-6' } },
      { id: 'a1', type: 'action', position: { x: 200, y: 360 }, data: { label: 'Benachrichtigen', actionType: 'notify' } },
    ],
    edges: [
      { id: 'e1', source: 't1', target: 'ag1', animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } },
      { id: 'e2', source: 'ag1', target: 'a1', animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } },
    ],
  },
];

export function WorkflowToolbar({
  workflowId,
  workflowName,
  nodes,
  edges,
  onNameChange,
  onTemplateLoad,
}: WorkflowToolbarProps) {
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const graphDefinition = { nodes, edges };
      if (workflowId) {
        await axios.delete(`/api/agent-workflows/${workflowId}`);
      }
      await axios.post('/api/agent-workflows', {
        name: workflowName,
        description: `Visual workflow: ${workflowName}`,
        graph_definition: graphDefinition,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      logError('WorkflowToolbar.save', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!workflowId) return;
    setRunning(true);
    try {
      await axios.post(`/api/agent-workflows/${workflowId}/execute`, { context: 'operations' });
    } catch (err) {
      logError('WorkflowToolbar.run', err);
    } finally {
      setRunning(false);
    }
  };

  const handleExport = () => {
    const json = JSON.stringify({ name: workflowName, nodes, edges }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, '-').toLowerCase()}.workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-[#0d1117]">
      {/* Workflow name */}
      <input
        type="text"
        value={workflowName}
        onChange={(e) => onNameChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-white/90 placeholder-white/30 outline-none border-b border-transparent focus:border-white/20 transition-colors"
        placeholder="Workflow benennen…"
      />

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Template picker */}
        <div className="relative">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
          >
            <LayoutTemplate size={14} />
            Template
          </button>
          {showTemplates && (
            <div className="absolute top-full right-0 mt-1 w-52 bg-[#161b22] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  className="w-full px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  onClick={() => {
                    onTemplateLoad(tpl.nodes, tpl.edges);
                    setShowTemplates(false);
                  }}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
        >
          <Download size={14} />
          Export
        </button>

        <button
          onClick={handleRun}
          disabled={running || !workflowId}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={14} />
          {running ? 'Läuft…' : 'Ausführen'}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={14} />
          {saving ? 'Speichert…' : saveStatus === 'saved' ? 'Gespeichert ✓' : saveStatus === 'error' ? 'Fehler!' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
