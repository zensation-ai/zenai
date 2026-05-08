import { cn } from '@/lib/utils';
import { Clock, Bolt, GitBranch, Bot } from 'lucide-react';

interface PaletteItem {
  type: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  defaultData: Record<string, unknown>;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'Start the workflow',
    icon: Clock,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-600/50 hover:border-green-400',
    defaultData: { label: 'New Trigger', triggerType: 'manual' },
  },
  {
    type: 'action',
    label: 'Action',
    description: 'Execute a task',
    icon: Bolt,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-600/50 hover:border-blue-400',
    defaultData: { label: 'New Action' },
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on logic',
    icon: GitBranch,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-600/50 hover:border-yellow-400',
    defaultData: { label: 'New Condition' },
  },
  {
    type: 'agent',
    label: 'Agent',
    description: 'Run an AI agent',
    icon: Bot,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-600/50 hover:border-purple-400',
    defaultData: { label: 'New Agent', blueprintName: 'Custom Agent' },
  },
];

export function NodePalette() {
  function handleDragStart(event: React.DragEvent, item: PaletteItem) {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({ type: item.type, data: item.defaultData }),
    );
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className="w-48 flex-shrink-0 flex flex-col gap-2 p-3 bg-[#0d1117] border-r border-white/10 overflow-y-auto">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1 px-1">
        Node Types
      </div>

      {PALETTE_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing',
              'bg-[#161b22] transition-all duration-150 select-none',
              item.borderColor,
            )}
          >
            <div className={cn('p-1.5 rounded-md flex-shrink-0', item.bgColor)}>
              <Icon className={cn('w-3.5 h-3.5', item.color)} />
            </div>
            <div className="min-w-0">
              <div className={cn('text-xs font-semibold leading-none', item.color)}>{item.label}</div>
              <div className="text-[10px] text-white/40 mt-0.5 leading-tight">{item.description}</div>
            </div>
          </div>
        );
      })}

      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-[10px] text-white/30 leading-relaxed px-1">
          Drag nodes onto the canvas to build your workflow.
        </div>
      </div>
    </div>
  );
}
