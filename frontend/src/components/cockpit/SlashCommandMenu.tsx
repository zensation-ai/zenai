import { useEffect, useState } from 'react';
import {
  CheckSquare, Mail, Lightbulb, Search, Calendar,
  Users, FileText, Brain, type LucideIcon,
} from 'lucide-react';
import type { PanelType } from '../../contexts/PanelContext';
import './SlashCommandMenu.css';

export interface SlashCommand {
  command: string;
  label: string;
  description: string;
  panel: PanelType;
  icon: LucideIcon;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: 'task',     label: 'Neuer Task',   description: 'Task-Panel oeffnen',       panel: 'tasks',     icon: CheckSquare },
  { command: 'email',    label: 'Neue Email',   description: 'Email-Panel oeffnen',      panel: 'email',     icon: Mail        },
  { command: 'idea',     label: 'Neue Idee',    description: 'Ideen-Panel oeffnen',      panel: 'ideas',     icon: Lightbulb   },
  { command: 'search',   label: 'Suchen',       description: 'Suche oeffnen',            panel: 'search',    icon: Search      },
  { command: 'calendar', label: 'Kalender',     description: 'Kalender-Panel oeffnen',   panel: 'calendar',  icon: Calendar    },
  { command: 'contacts', label: 'Kontakte',     description: 'Kontakte-Panel oeffnen',   panel: 'contacts',  icon: Users       },
  { command: 'docs',     label: 'Dokumente',    description: 'Dokumente-Panel oeffnen',  panel: 'documents', icon: FileText    },
  { command: 'memory',   label: 'Gedaechtnis',  description: 'Memory-Panel oeffnen',     panel: 'memory',    icon: Brain       },
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
    <div className="slash-menu" role="listbox" aria-label="Befehle">
      {filtered.length === 0 ? (
        <p className="slash-menu__empty">Keine Befehle gefunden</p>
      ) : (
        filtered.map((cmd, i) => {
          const Icon = cmd.icon;
          return (
            <button
              key={cmd.command}
              role="option"
              aria-selected={i === activeIndex}
              className={`slash-menu__item${i === activeIndex ? ' slash-menu__item--active' : ''}`}
              onClick={() => onSelect(cmd)}
            >
              <Icon size={14} />
              <span className="slash-menu__label">{cmd.label}</span>
              <span className="slash-menu__command">/{cmd.command}</span>
              <span className="slash-menu__desc">{cmd.description}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
