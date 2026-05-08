import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Clock, Zap, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TriggerNodeData {
  label: string;
  triggerType?: 'schedule' | 'event' | 'manual';
}

interface TriggerNodeProps {
  data: TriggerNodeData;
  selected?: boolean;
}

const TRIGGER_ICONS = {
  schedule: Clock,
  event: Zap,
  manual: Play,
};

export const TriggerNode = memo(function TriggerNode({ data, selected }: TriggerNodeProps) {
  const Icon = TRIGGER_ICONS[data.triggerType ?? 'manual'];

  return (
    <div
      className={cn(
        'bg-[#0d1117] rounded-lg px-4 py-3 min-w-[160px] shadow-lg',
        'border-2 transition-colors',
        selected ? 'border-green-400' : 'border-green-600/60',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-green-500/20">
          <Icon className="w-3.5 h-3.5 text-green-400" />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-green-400/70 mb-0.5">
            Trigger
          </div>
          <div className="text-xs font-medium text-white leading-tight">{data.label}</div>
        </div>
      </div>

      {/* Source handle — bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-green-500 !border-2 !border-green-300"
      />
    </div>
  );
});
