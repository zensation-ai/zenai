/**
 * InlineActions — defines the 5 inline assistance actions and their prompt builders.
 * Also exports InlineActionsBar, the horizontal button strip shown in the popover.
 */

import { RotateCcw, Minus, Plus, Languages, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InlineAction {
  id: string;
  label: string;
  icon: LucideIcon;
  prompt: (text: string) => string;
}

export const INLINE_ACTIONS: InlineAction[] = [
  {
    id: 'rewrite',
    label: 'Umschreiben',
    icon: RotateCcw,
    prompt: (text) => `Schreibe den folgenden Text um, behalte die Bedeutung bei, aber verbessere Stil und Klarheit:\n\n"${text}"`,
  },
  {
    id: 'shorten',
    label: 'Kürzen',
    icon: Minus,
    prompt: (text) => `Kürze den folgenden Text auf das Wesentliche, ohne wichtige Informationen zu verlieren:\n\n"${text}"`,
  },
  {
    id: 'expand',
    label: 'Erweitern',
    icon: Plus,
    prompt: (text) => `Erweitere den folgenden Text mit mehr Details, Kontext und Beispielen:\n\n"${text}"`,
  },
  {
    id: 'translate',
    label: 'Übersetzen',
    icon: Languages,
    prompt: (text) => `Übersetze den folgenden Text ins Englische (oder ins Deutsche, falls er bereits auf Englisch ist):\n\n"${text}"`,
  },
  {
    id: 'explain',
    label: 'Erklären',
    icon: HelpCircle,
    prompt: (text) => `Erkläre den folgenden Text in einfachen Worten:\n\n"${text}"`,
  },
];

interface InlineActionsBarProps {
  onSelect: (action: InlineAction) => void;
  disabled?: boolean;
}

export function InlineActionsBar({ onSelect, disabled = false }: InlineActionsBarProps) {
  return (
    <div className="flex items-center gap-1 p-1.5">
      {INLINE_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => onSelect(action)}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
              'text-white/80 hover:text-white hover:bg-white/10',
              'transition-colors duration-150 whitespace-nowrap',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title={action.label}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
