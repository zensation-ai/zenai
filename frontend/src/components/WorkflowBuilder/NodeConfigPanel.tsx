/**
 * NodeConfigPanel — right-side configuration panel for the selected React Flow node.
 * Shows node-type-specific config fields (cron, event filter, templates, etc.).
 */

import { X } from 'lucide-react';
import type { Node } from 'reactflow';

interface NodeConfigPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

function TriggerConfig({ data, onChange }: { data: Record<string, unknown>; onChange: (key: string, value: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Trigger-Typ</span>
        <select
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.triggerType as string) ?? 'schedule'}
          onChange={(e) => onChange('triggerType', e.target.value)}
        >
          <option value="schedule">Zeitplan (Cron)</option>
          <option value="event">Ereignis</option>
          <option value="webhook">Webhook</option>
          <option value="manual">Manuell</option>
        </select>
      </label>
      {(data.triggerType as string) === 'schedule' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50 uppercase tracking-wider">Cron-Ausdruck</span>
          <input
            type="text"
            className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 font-mono"
            value={(data.cron as string) ?? '0 9 * * 1-5'}
            onChange={(e) => onChange('cron', e.target.value)}
            placeholder="0 9 * * 1-5"
          />
        </label>
      )}
      {(data.triggerType as string) === 'event' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50 uppercase tracking-wider">Ereignis-Filter</span>
          <input
            type="text"
            className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
            value={(data.eventFilter as string) ?? ''}
            onChange={(e) => onChange('eventFilter', e.target.value)}
            placeholder="idea.created"
          />
        </label>
      )}
      {(data.triggerType as string) === 'webhook' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50 uppercase tracking-wider">Webhook-URL</span>
          <input
            type="text"
            className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 font-mono"
            value={(data.webhookUrl as string) ?? ''}
            onChange={(e) => onChange('webhookUrl', e.target.value)}
            placeholder="/api/webhooks/my-workflow"
          />
        </label>
      )}
    </div>
  );
}

function ActionConfig({ data, onChange }: { data: Record<string, unknown>; onChange: (key: string, value: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Aktion</span>
        <select
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.actionType as string) ?? 'notification'}
          onChange={(e) => onChange('actionType', e.target.value)}
        >
          <option value="create">Erstellen</option>
          <option value="update">Aktualisieren</option>
          <option value="notify">Benachrichtigen</option>
          <option value="ai_process">KI-Verarbeitung</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Ziel-Entity</span>
        <input
          type="text"
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.targetEntity as string) ?? ''}
          onChange={(e) => onChange('targetEntity', e.target.value)}
          placeholder="idea, task, email..."
        />
      </label>
    </div>
  );
}

function ConditionConfig({ data, onChange }: { data: Record<string, unknown>; onChange: (key: string, value: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Bedingungstyp</span>
        <select
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.conditionType as string) ?? 'field_check'}
          onChange={(e) => onChange('conditionType', e.target.value)}
        >
          <option value="field_check">Feld-Prüfung</option>
          <option value="ai_classify">KI-Klassifikation</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Bedingung</span>
        <input
          type="text"
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.condition as string) ?? ''}
          onChange={(e) => onChange('condition', e.target.value)}
          placeholder="priority === 'high'"
        />
      </label>
    </div>
  );
}

function AgentConfig({ data, onChange }: { data: Record<string, unknown>; onChange: (key: string, value: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Blueprint</span>
        <input
          type="text"
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.blueprint as string) ?? ''}
          onChange={(e) => onChange('blueprint', e.target.value)}
          placeholder="Email-Triage, Researcher..."
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Modell</span>
        <select
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.model as string) ?? 'claude-sonnet-4-6'}
          onChange={(e) => onChange('model', e.target.value)}
        >
          <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
          <option value="claude-opus-4-6">Claude Opus 4.6</option>
          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50 uppercase tracking-wider">Max Tokens</span>
        <input
          type="number"
          className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
          value={(data.maxTokens as number) ?? 4096}
          onChange={(e) => onChange('maxTokens', e.target.value)}
          min={256}
          max={32000}
        />
      </label>
    </div>
  );
}

export function NodeConfigPanel({ node, onClose, onUpdate }: NodeConfigPanelProps) {
  if (!node) return null;

  const handleChange = (key: string, value: string) => {
    onUpdate(node.id, { ...node.data as Record<string, unknown>, [key]: value });
  };

  const typedData = node.data as Record<string, unknown>;

  return (
    <aside className="w-72 h-full flex flex-col bg-[#0d1117] border-l border-white/10 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">{node.type}</p>
          <h3 className="text-sm font-semibold text-white/90">
            {(typedData.label as string) ?? 'Node konfigurieren'}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          aria-label="Panel schließen"
        >
          <X size={16} />
        </button>
      </div>

      {/* Label */}
      <div className="px-4 py-3 border-b border-white/10">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50 uppercase tracking-wider">Label</span>
          <input
            type="text"
            className="bg-[#21262d] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90"
            value={(typedData.label as string) ?? ''}
            onChange={(e) => handleChange('label', e.target.value)}
          />
        </label>
      </div>

      {/* Type-specific config */}
      <div className="px-4 py-3 flex-1">
        {node.type === 'trigger' && (
          <TriggerConfig data={typedData} onChange={handleChange} />
        )}
        {node.type === 'action' && (
          <ActionConfig data={typedData} onChange={handleChange} />
        )}
        {node.type === 'condition' && (
          <ConditionConfig data={typedData} onChange={handleChange} />
        )}
        {node.type === 'agent' && (
          <AgentConfig data={typedData} onChange={handleChange} />
        )}
      </div>
    </aside>
  );
}
