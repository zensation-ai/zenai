/**
 * TopBar — Workspace Layout Top Bar
 *
 * Contains: Logo | (center empty) | Actions (Search, Chat Drawer, Context)
 */

import { useMemo, type CSSProperties } from 'react';
import { Search, MessageSquare, ChevronDown } from 'lucide-react';
import { useLayoutModeSafe } from '../../contexts/LayoutModeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ContextIndicator } from './ContextIndicator';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { SparkLogo } from './SparkLogo';
import { cn } from '@/lib/utils';
import type { AIContext } from '../ContextSwitcher';

const CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy'];
const CONTEXT_COLORS: Record<AIContext, string> = {
  operations: '#144A56',
  finance: '#f59e0b',
  people: '#10b981',
  strategy: '#f43f5e',
};
const DEFAULT_CONTEXT_LABELS: Record<AIContext, string> = {
  operations: 'Operativ',
  finance: 'Finanzen',
  people: 'Team',
  strategy: 'Strategie',
};

interface TopBarProps {
  context: AIContext;
  onContextChange?: (ctx: AIContext) => void;
  onSearchOpen?: () => void;
  onNavigateHome?: () => void;
}

export function TopBar({ context, onContextChange, onSearchOpen, onNavigateHome }: TopBarProps) {
  const { state, dispatch } = useLayoutModeSafe();
  const { workspaceContexts } = useAuth();

  // Dynamic context labels from workspace config
  const contextLabels = useMemo(() => {
    if (workspaceContexts.length === 0) return DEFAULT_CONTEXT_LABELS;
    const labels = { ...DEFAULT_CONTEXT_LABELS };
    for (const wc of workspaceContexts) {
      const base = wc.base_schema as AIContext;
      if (base in labels) labels[base] = wc.name;
    }
    return labels;
  }, [workspaceContexts]);

  return (
    <header className="flex items-center h-12 px-4 bg-bg-secondary border-b border-border shrink-0 z-topbar gap-3">
      <button
        className="flex items-center gap-2 select-none shrink-0 bg-none border-none p-0 cursor-pointer rounded-lg transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onNavigateHome}
        aria-label="Zur Startseite"
        type="button"
      >
        <SparkLogo size={28} animated variant="dark" />
        <span className="font-bold text-base text-primary tracking-tight">ZenAI</span>
      </button>

      <div className="flex-1 flex items-center justify-center">
        <WorkspaceSwitcher />
      </div>

      <nav className="flex items-center gap-2 shrink-0" aria-label="Schnellaktionen">
        {onSearchOpen && (
          <button
            className="flex items-center justify-center size-9 rounded-lg border-none bg-transparent text-text-muted cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:text-text"
            onClick={onSearchOpen}
            title="Suche (⌘K)"
            aria-label="Suche öffnen"
          >
            <Search size={18} />
          </button>
        )}

        <button
          className={cn(
            'flex items-center justify-center size-9 rounded-lg border-none bg-transparent text-text-muted cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:text-text',
            state.chatDrawerOpen && 'text-primary',
          )}
          onClick={() => dispatch({ type: 'TOGGLE_CHAT_DRAWER' })}
          title="Chat (⌘⇧C)"
          aria-label="Chat-Drawer umschalten"
          aria-pressed={state.chatDrawerOpen}
        >
          <MessageSquare size={18} />
        </button>

        {onContextChange && (
          <button
            className="inline-flex items-center gap-1.5 min-h-8 px-3 py-1 rounded-full border border-border bg-surface text-text cursor-pointer text-[0.8125rem] font-medium transition-[background,border-color] duration-150 hover:bg-surface-hover hover:border-text-muted"
            onClick={() => {
              const idx = CONTEXTS.indexOf(context);
              onContextChange(CONTEXTS[(idx + 1) % CONTEXTS.length]);
            }}
            aria-label={`Kontext: ${contextLabels[context]}. Klicken um zu wechseln.`}
          >
            <span className="size-2 rounded-full shrink-0 bg-[var(--bg)]" style={{ '--bg': CONTEXT_COLORS[context] } as CSSProperties} />
            <span>{contextLabels[context]}</span>
            <ChevronDown size={14} />
          </button>
        )}
        <ContextIndicator context={context} />
      </nav>
    </header>
  );
}

export default TopBar;
