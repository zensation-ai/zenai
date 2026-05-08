import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Bolt } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionNodeData {
  label: string;
  description?: string;
}

interface ActionNodeProps {
  data: ActionNodeData;
  selected?: boolean;
}

export const ActionNode = memo(function ActionNode({ data, selected }: ActionNodeProps) {
  return (
    <div
      className={cn(
        'bg-[#0d1117] rounded-lg px-4 py-3 min-w-[160px] shadow-lg',
        'border-2 transition-colors',
        selected ? 'border-blue-400' : 'border-blue-600/60',
      )}
    >
      {/* Target handle — top center */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-blue-300"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-blue-500/20">
          <Bolt className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-blue-400/70 mb-0.5">
            Action
          </div>
          <div className="text-xs font-medium text-white leading-tight">{data.label}</div>
          {data.description && (
            <div className="text-[10px] text-white/50 mt-0.5 leading-tight">{data.description}</div>
          )}
        </div>
      </div>

      {/* Source handle — bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-blue-300"
      />
    </div>
  );
});
