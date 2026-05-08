import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConditionNodeData {
  label: string;
  condition?: string;
}

interface ConditionNodeProps {
  data: ConditionNodeData;
  selected?: boolean;
}

export const ConditionNode = memo(function ConditionNode({ data, selected }: ConditionNodeProps) {
  return (
    <div
      className={cn(
        'bg-[#0d1117] rounded-lg px-4 py-3 min-w-[160px] shadow-lg',
        'border-2 transition-colors',
        selected ? 'border-yellow-400' : 'border-yellow-600/60',
      )}
    >
      {/* Target handle — top center */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-yellow-500 !border-2 !border-yellow-300"
      />

      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-yellow-500/20">
          <GitBranch className="w-3.5 h-3.5 text-yellow-400" />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-yellow-400/70 mb-0.5">
            Condition
          </div>
          <div className="text-xs font-medium text-white leading-tight">{data.label}</div>
          {data.condition && (
            <div className="text-[10px] text-white/50 mt-0.5 leading-tight font-mono">{data.condition}</div>
          )}
        </div>
      </div>

      {/* True branch — bottom left (green) */}
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-green-500 !border-2 !border-green-300 left-[30%]"
      />

      {/* False branch — bottom right (red) */}
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-red-500 !border-2 !border-red-300 left-[70%]"
      />

      {/* Branch labels */}
      <div className="flex justify-between mt-2 px-1">
        <span className="text-[9px] text-green-400/70 font-semibold">TRUE</span>
        <span className="text-[9px] text-red-400/70 font-semibold">FALSE</span>
      </div>
    </div>
  );
});
