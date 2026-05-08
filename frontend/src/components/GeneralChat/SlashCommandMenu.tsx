import { useEffect, useState } from 'react';
import {
  CheckSquare, Mail, Lightbulb, Search, Calendar,
  Users, FileText, Brain, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  /** Target action identifier (e.g. 'tasks', 'email', 'ideas') */
  action: string;
  icon: LucideIcon;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: 'task',     label: 'Neuer Task',   description: 'Aufgaben öffnen',         action: 'tasks',     icon: CheckSquare },
  { command: 'email',    label: 'Neue Email',   description: 'E-Mail öffnen',           action: 'email',     icon: Mail        },
  { command: 'idea',     label: 'Neue Idee',    description: 'Ideen öffnen',            action: 'ideas',     icon: Lightbulb   },
  { command: 'search',   label: 'Suchen',       description: 'Suche öffnen',            action: 'search',    icon: Search      },
  { command: 'calendar', label: 'Kalender',     description: 'Kalender öffnen',         action: 'calendar',  icon: Calendar    },
  { command: 'contacts', label: 'Kontakte',     description: 'Kontakte öffnen',         action: 'contacts',  icon: Users       },
  { command: 'docs',     label: 'Dokumente',    description: 'Dokumente öffnen',        action: 'documents', icon: FileText    },
  { command: 'memory',   label: 'Gedächtnis',   description: 'Gedächtnis öffnen',       action: 'memory',    icon: Brain       },
];

export interface SlashCommandMenuProps {
  query: string;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  visible: boolean;
}

export function SlashCommandMenu({ query, onSelect, onClose, visible }: SlashCommandMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = SLASH_COMMANDS.filter(cmd => {
    const q = query.toLowerCase();
    return cmd.command.toLowerCase().includes(q) || cmd.label.toLowerCase().includes(q);
  });

  // Reset active index when filter results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[activeIndex]) {
          onSelect(filtered[activeIndex]);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, filtered, activeIndex, onSelect, onClose]);

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-full left-3 right-3 bg-surface border border-glass-border rounded-md shadow-lg max-h-60 overflow-y-auto z-50 p-1"
      role="listbox"
      aria-label="Befehle"
    >
      {filtered.length === 0 ? (
        <p className="px-3 py-2.5 text-text-muted text-xs m-0">Keine Befehle gefunden</p>
      ) : (
        filtered.map((cmd, i) => {
          const Icon = cmd.icon;
          return (
            <button
              key={cmd.command}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                'flex items-center gap-2.5 py-2 px-2.5 border-none bg-transparent rounded-md',
                'cursor-pointer w-full text-left text-text text-[13px] transition-colors duration-100',
                i === activeIndex && 'bg-surface-hover',
                'hover:bg-surface-hover',
                'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]'
              )}
              onClick={() => onSelect(cmd)}
            >
              <Icon size={14} />
              <span className="font-medium">{cmd.label}</span>
              <span className="text-text-muted text-[11px] font-mono">/{cmd.command}</span>
              <span className="text-text-muted text-xs ml-auto">{cmd.description}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
