/**
 * IdeaNode — ReactFlow custom node for displaying ideas on the canvas board.
 *
 * Shows idea title + truncated content, color-coded by context.
 * Source/target handles for edge connections.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface IdeaNodeData {
  title: string;
  content: string;
  context?: 'operations' | 'finance' | 'people' | 'strategy';
}

const CONTEXT_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  operations: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', accent: 'text-purple-400' },
  finance: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', accent: 'text-blue-400' },
  people: { bg: 'bg-green-500/10', border: 'border-green-500/30', accent: 'text-green-400' },
  strategy: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', accent: 'text-amber-400' },
};

function IdeaNodeComponent({ data, selected }: NodeProps<IdeaNodeData>) {
  const colors = CONTEXT_COLORS[data.context || 'operations'] || CONTEXT_COLORS.operations;
  const truncated = data.content.length > 100
    ? data.content.slice(0, 100) + '...'
    : data.content;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[160px] max-w-[240px] shadow-lg backdrop-blur-sm transition-shadow ${
        colors.bg
      } ${colors.border} ${selected ? 'ring-2 ring-white/30 shadow-xl' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/40 !border-0" />

      <div className={`text-xs font-semibold mb-1 ${colors.accent}`}>
        {data.title || 'Untitled'}
      </div>
      {truncated && (
        <div className="text-[11px] text-white/60 leading-relaxed">
          {truncated}
        </div>
      )}
      {data.context && (
        <div className={`mt-1.5 text-[10px] ${colors.accent} opacity-60 uppercase tracking-wider`}>
          {data.context}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/40 !border-0" />
    </div>
  );
}

export const IdeaNode = memo(IdeaNodeComponent);
