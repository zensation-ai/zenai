import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentNodeData {
  label: string;
  blueprintName?: string;
  role?: string;
}

interface AgentNodeProps {
  data: AgentNodeData;
  selected?: boolean;
}

export const AgentNode = memo(function AgentNode({ data, selected }: AgentNodeProps) {
  return (
    <div
      className={cn(
        'bg-[#0d1117] rounded-lg px-4 py-3 min-w-[160px] shadow-lg',
        'border-2 transition-colors',
        selected ? 'border-purple-400' : 'border-purple-600/60',
      )}
    >
      {/* Target handle — top center */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-purple-500 !border-2 !border-purple-300"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-purple-500/20">
          <Bot className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-purple-400/70 mb-0.5">
            Agent
          </div>
          <div className="text-xs font-medium text-white leading-tight">{data.label}</div>
          {data.blueprintName && (
            <div className="text-[10px] text-purple-300/60 mt-0.5 leading-tight">
              {data.blueprintName}
            </div>
          )}
          {data.role && (
            <div className="text-[10px] text-white/40 mt-0.5 leading-tight italic">{data.role}</div>
          )}
        </div>
      </div>

      {/* Source handle — bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-purple-500 !border-2 !border-purple-300"
      />
    </div>
  );
});
