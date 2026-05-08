import { useState, useEffect, useCallback, useRef, memo, useMemo, useDeferredValue, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Fuse, { type IFuseOptions } from 'fuse.js';
import { motion } from 'framer-motion';
import type { Page } from '../types/idea';
import { ALL_NAVIGABLE_ITEMS } from '../navigation';
import { formatShortcut } from '../hooks/useKeyboardShortcut';
import { useRegisteredCommands } from '../hooks/useCommandRegistry';
import { getGKeyLabel } from '../hooks/useKeyboardNavigation';
import { scaleIn, springs, durations, usePrefersReducedMotion } from '../utils/animations';
import { BottomSheet } from './ui';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { cn } from '@/lib/utils';
import { MODE_COLORS } from '../constants/chart-colors';

// ============================================
// Types
// ============================================

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: CommandCategory;
  keywords?: string[];
  shortcut?: string;
  action: () => void;
  /** Higher = more important, shown first */
  priority?: number;
}

export type CommandCategory =
  | 'navigation'
  | 'ai-features'
  | 'content'
  | 'settings'
  | 'actions'
  | 'recent';

type PaletteMode = 'universal' | 'navigation' | 'commands' | 'contacts' | 'tags';

const MODE_PREFIXES: Record<string, PaletteMode> = {
  '/': 'navigation',
  '>': 'commands',
  '@': 'contacts',
  '#': 'tags',
};

const MODE_INFO: Record<PaletteMode, { label: string; color: string; placeholder: string }> = {
  universal: { label: '', color: '', placeholder: 'Suchen... (/ Seiten, > Befehle, @ Kontakte, # Tags)' },
  navigation: { label: '/', color: MODE_COLORS.navigation, placeholder: 'Navigation...' },
  commands: { label: '>', color: MODE_COLORS.commands, placeholder: 'Befehl ausführen...' },
  contacts: { label: '@', color: MODE_COLORS.contacts, placeholder: 'Kontakt suchen...' },
  tags: { label: '#', color: MODE_COLORS.tags, placeholder: 'Tag suchen...' },
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  recentPages?: string[];
  currentPage?: Page;
}

// ============================================
// Recency storage
// ============================================

const RECENCY_KEY = 'zenai_command_recency';
const MAX_RECENCY_ENTRIES = 30;

function getRecencyMap(): Record<string, number> {
  try {
    const stored = localStorage.getItem(RECENCY_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function recordRecency(commandId: string): void {
  try {
    const map = getRecencyMap();
    map[commandId] = Date.now();
    // Prune old entries
    const entries = Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_RECENCY_ENTRIES);
    localStorage.setItem(RECENCY_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage errors
  }
}

// ============================================
// Category Labels & Icons
// ============================================

const CATEGORY_INFO: Record<CommandCategory, { label: string; icon: string }> = {
  recent: { label: 'Kürzlich', icon: '🕐' },
  navigation: { label: 'Navigation', icon: '🧭' },
  'ai-features': { label: 'KI-Features', icon: '🤖' },
  content: { label: 'Inhalte', icon: '📄' },
  settings: { label: 'Einstellungen', icon: '⚙️' },
  actions: { label: 'Aktionen', icon: '⚡' },
};

const CATEGORY_ORDER: CommandCategory[] = [
  'recent',
  'actions',
  'navigation',
  'ai-features',
  'content',
  'settings',
];

const MODE_CATEGORY_FILTER: Partial<Record<PaletteMode, CommandCategory[]>> = {
  navigation: ['navigation', 'recent'],
  commands: ['actions', 'ai-features', 'settings'],
};

// ============================================
// Fuse.js Configuration
// ============================================

const FUSE_OPTIONS: IFuseOptions<Command> = {
  keys: [
    { name: 'label', weight: 0.5 },
    { name: 'description', weight: 0.25 },
    { name: 'keywords', weight: 0.25 },
  ],
  threshold: 0.3,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 1,
};

const MAX_VISIBLE_RESULTS = 12;

// ============================================
// Command Palette Component
// ============================================

export const CommandPalette = memo(function CommandPalette({
  isOpen,
  onClose,
  commands,
  recentPages = [],
  currentPage,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useBreakpoint();
  const trapRef = useFocusTrap({ isActive: isOpen, onEscape: onClose });

  // Consume page-registered commands
  const registeredCommands = useRegisteredCommands();

  // Determine mode from prefix — use deferredQuery for filtering to keep input responsive
  const { mode, cleanQuery } = useMemo(() => {
    if (!deferredQuery) return { mode: 'universal' as PaletteMode, cleanQuery: '' };
    const firstChar = deferredQuery[0];
    const detectedMode = MODE_PREFIXES[firstChar];
    if (detectedMode) {
      return { mode: detectedMode, cleanQuery: deferredQuery.slice(1).trimStart() };
    }
    return { mode: 'universal' as PaletteMode, cleanQuery: deferredQuery };
  }, [deferredQuery]);

  const modeInfo = MODE_INFO[mode];

  // Merge built-in commands with registry commands + add G-key shortcuts
  const allCommands = useMemo(() => {
    const recencyMap = getRecencyMap();

    // Start with built-in commands, add G-key shortcuts
    const enriched = commands.map(cmd => {
      const gKey = getGKeyLabel(cmd.id as Page);
      const shortcutDisplay = cmd.shortcut ?? (gKey ? gKey : undefined);
      const recencyBonus = recencyMap[cmd.id] ? 50 : 0;
      const contextBonus = currentPage && isRelatedToCurrentPage(cmd, currentPage) ? 20 : 0;

      return {
        ...cmd,
        shortcut: shortcutDisplay,
        priority: (cmd.priority ?? 0) + recencyBonus + contextBonus,
        category: recentPages.includes(cmd.id) ? 'recent' as CommandCategory : cmd.category,
      };
    });

    // Add registered commands
    for (const regCmd of registeredCommands) {
      enriched.push({
        id: regCmd.id,
        label: regCmd.label,
        description: regCmd.description,
        icon: regCmd.icon ?? '⚡',
        category: 'actions' as CommandCategory,
        keywords: regCmd.keywords,
        shortcut: regCmd.shortcut,
        action: regCmd.action,
        priority: (regCmd.priority ?? 0) + 30, // Boost page-specific commands
      });
    }

    return enriched;
  }, [commands, recentPages, registeredCommands, currentPage]);

  // Filter by mode
  const modeFilteredCommands = useMemo(() => {
    const categoryFilter = MODE_CATEGORY_FILTER[mode];
    if (!categoryFilter) return allCommands;
    return allCommands.filter(cmd => categoryFilter.includes(cmd.category));
  }, [allCommands, mode]);

  // Fuse.js search
  const fuse = useMemo(
    () => new Fuse(modeFilteredCommands, FUSE_OPTIONS),
    [modeFilteredCommands]
  );

  const filteredCommands = useMemo(() => {
    if (!cleanQuery.trim()) {
      // No query: sort by priority
      return [...modeFilteredCommands]
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .slice(0, MAX_VISIBLE_RESULTS);
    }

    return fuse
      .search(cleanQuery)
      .slice(0, MAX_VISIBLE_RESULTS)
      .map((r: { item: Command }) => r.item);
  }, [fuse, modeFilteredCommands, cleanQuery]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<CommandCategory, Command[]> = {
      recent: [],
      navigation: [],
      'ai-features': [],
      content: [],
      settings: [],
      actions: [],
    };

    for (const cmd of filteredCommands) {
      groups[cmd.category].push(cmd);
    }

    return groups;
  }, [filteredCommands]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const result: Command[] = [];
    for (const category of CATEGORY_ORDER) {
      result.push(...groupedCommands[category]);
    }
    return result;
  }, [groupedCommands]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  // Execute and record recency
  const executeCommand = useCallback((command: Command) => {
    recordRecency(command.id);
    command.action();
    onClose();
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) {
          executeCommand(flatList[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex(i => Math.max(i - 1, 0));
        } else {
          setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
        }
        break;
      case 'Backspace':
        // If query is just a prefix character and backspace empties it, clear mode
        if (query.length === 1 && MODE_PREFIXES[query]) {
          e.preventDefault();
          setQuery('');
        }
        break;
    }
  }, [flatList, selectedIndex, onClose, executeCommand, query]);

  // Global escape handler + body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const reducedMotion = usePrefersReducedMotion();

  if (!isOpen) return null;

  let currentIndex = -1;

  const kbdClass = 'inline-flex items-center justify-center min-w-5 px-1.5 py-0.5 bg-white/10 border border-white/15 rounded font-mono text-[10px] text-white/70';

  const paletteContent = (
    <>
      {/* Search Input */}
      <div className="p-4 border-b border-white/8">
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-md px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <span className="text-lg opacity-60 shrink-0" aria-hidden="true">
            🔍
          </span>
          {mode !== 'universal' && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 text-white rounded-xl text-[11px] font-semibold tracking-[0.02em] shrink-0 animate-scale-in bg-[var(--bg)]"
              style={{ '--bg': modeInfo.color } as CSSProperties}
            >
              {modeInfo.label}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-base font-sans text-text placeholder:text-white/65"
            placeholder={modeInfo.placeholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <kbd className="shrink-0 px-2 py-1 bg-white/10 border border-white/15 rounded-md font-mono text-[11px] text-white/70 uppercase max-sm:hidden">ESC</kbd>
        </div>
        {/* Mode hints */}
        {mode === 'universal' && !query && (
          <div className="flex gap-3 px-4 pt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
              <kbd className={kbdClass}>/</kbd> Navigation
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
              <kbd className={kbdClass}>&gt;</kbd> Befehle
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
              <kbd className={kbdClass}>@</kbd> Kontakte
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
              <kbd className={kbdClass}>#</kbd> Tags
            </span>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-2 scroll-smooth scrollbar-thin" ref={listRef}>
        {flatList.length === 0 && query ? (
          <div className="py-6 text-center text-text-secondary">
            <p className="text-sm font-medium">Keine Ergebnisse</p>
            <p className="text-[0.8125rem] mt-1">Nichts gefunden für &quot;{query}&quot;</p>
          </div>
        ) : (
          CATEGORY_ORDER.map(category => {
            const items = groupedCommands[category];
            if (items.length === 0) return null;

            const info = CATEGORY_INFO[category];

            return (
              <div key={category} className="mb-2 last:mb-0">
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                  <span className="text-xs">{info.icon}</span>
                  <span>{info.label}</span>
                </div>
                <ul className="list-none m-0 p-0">
                  {items.map(command => {
                    currentIndex++;
                    const isSelected = currentIndex === selectedIndex;
                    const itemIndex = currentIndex;

                    return (
                      <li key={command.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex items-center gap-3 w-full py-2.5 px-3 bg-transparent border-none rounded-[10px] cursor-pointer text-left font-sans transition-all duration-150',
                            'hover:bg-surface-hover',
                            isSelected && 'bg-surface-hover outline-2 outline-primary -outline-offset-2',
                          )}
                          data-selected={isSelected}
                          onClick={() => executeCommand(command)}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                        >
                          <span className="text-xl size-7 flex items-center justify-center shrink-0">{command.icon}</span>
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-text whitespace-nowrap overflow-hidden text-ellipsis">{command.label}</span>
                            {command.description && (
                              <span className="text-xs text-white/60 whitespace-nowrap overflow-hidden text-ellipsis max-sm:hidden">
                                {command.description}
                              </span>
                            )}
                          </div>
                          {command.shortcut && (
                            <kbd className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white/10 border border-white/15 rounded-[5px] font-mono text-[11px] text-white/70">
                              {formatShortcut(command.shortcut)}
                            </kbd>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-white/8 bg-white/3">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-white/65">
            <kbd className={kbdClass}>↑↓</kbd> navigieren
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/65">
            <kbd className={kbdClass}>↵</kbd> auswählen
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/65">
            <kbd className={kbdClass}>esc</kbd> schließen
          </span>
        </div>
      </div>
    </>
  );

  // Mobile: render as BottomSheet
  if (isMobile) {
    return createPortal(
      <BottomSheet isOpen={isOpen} onClose={onClose} snapPoint="full" title="Schnellnavigation">
        <div className="flex flex-col max-h-full overflow-hidden">
          {paletteContent}
        </div>
      </BottomSheet>,
      document.body
    );
  }

  // Desktop: render as centered modal with animation
  return createPortal(
    <motion.div
      className="fixed inset-0 bg-glass-bg backdrop-blur-glass flex items-start justify-center pt-[15vh] z-command motion-reduce:animate-none"
      onClick={onClose}
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: durations.fast }}
    >
      <motion.div
        ref={trapRef}
        className="bg-surface/95 border border-white/10 rounded-lg w-full max-w-[560px] max-h-[70vh] flex flex-col shadow-lg overflow-hidden motion-reduce:animate-none max-sm:max-h-[85vh] max-sm:rounded-md"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Schnellnavigation"
        variants={reducedMotion ? undefined : scaleIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={reducedMotion ? { duration: 0.01 } : { ...springs.snappy, duration: durations.instant }}
      >
        {paletteContent}
      </motion.div>
    </motion.div>,
    document.body
  );
});

// ============================================
// Context-awareness helper
// ============================================

function isRelatedToCurrentPage(cmd: Command, currentPage: Page): boolean {
  // Boost commands that match the current page context
  const pageContextMap: Record<string, string[]> = {
    ideas: ['action-new-idea', 'incubator', 'triage', 'archive', 'workshop'],
    calendar: ['action-new-task', 'meetings', 'kanban', 'gantt'],
    email: ['action-new-email'],
    documents: ['canvas', 'media', 'meetings'],
    chat: ['action-voice'],
  };
  const related = pageContextMap[currentPage];
  return related?.includes(cmd.id) ?? false;
}

// ============================================
// Hook for Command Palette
// ============================================

interface UseCommandPaletteOptions {
  onNavigate: (page: Page) => void;
  onAction?: (action: string) => void;
  /** Callback to open a panel by ID */
  onOpenPanel?: (panelId: string) => void;
  /** External recent pages from usePageHistory (shared state) */
  externalRecentPages?: string[];
  /** Current page for context-awareness */
  currentPage?: Page;
}

export function useCommandPalette({ onNavigate, onAction, externalRecentPages, currentPage: _currentPage }: UseCommandPaletteOptions) {
  const [isOpen, setIsOpen] = useState(false);

  // Use external recent pages if provided, otherwise empty
  const recentPages = externalRecentPages ?? [];

  // Navigate directly (tracking is handled by usePageHistory in App.tsx)
  const navigateTo = useCallback((page: Page) => {
    onNavigate(page);
  }, [onNavigate]);

  // Build commands — navigation auto-generated from ALL_NAVIGABLE_ITEMS
  const commands: Command[] = useMemo(() => {
    // Emoji icons for nav items (by page id)
    const NAV_ICONS: Record<string, string> = {
      hub: '💬', ideas: '💡', calendar: '📋', email: '✉️',
      documents: '📚', business: '💼', 'my-ai': '🤖', settings: '⚙️',
    };

    // Auto-generate navigation commands from ALL_NAVIGABLE_ITEMS
    const navCommands: Command[] = ALL_NAVIGABLE_ITEMS.map((item, i) => ({
      id: item.page,
      label: item.label,
      description: item.description,
      icon: NAV_ICONS[item.page] ?? '📄',
      category: 'navigation' as CommandCategory,
      keywords: [item.page, item.label.toLowerCase(), ...(item.subPages ?? [])],
      priority: 110 - i * 5,
      action: () => navigateTo(item.page),
    }));

    return [
      ...navCommands,

      // === Sub-page shortcuts ===
      {
        id: 'notifications',
        label: 'Unified Inbox',
        description: 'Alle Benachrichtigungen & offene Punkte',
        icon: '📥',
        category: 'navigation' as CommandCategory,
        keywords: ['inbox', 'benachrichtigungen', 'notifications'],
        priority: 60,
        action: () => navigateTo('notifications'),
      },
      {
        id: 'contacts',
        label: 'Kontakte',
        description: 'Kontakte & Organisationen verwalten',
        icon: '👥',
        category: 'navigation' as CommandCategory,
        keywords: ['kontakte', 'contacts', 'personen', 'crm'],
        priority: 55,
        action: () => navigateTo('contacts'),
      },
      {
        id: 'finance',
        label: 'Finanzen',
        description: 'Ausgaben, Budgets & Sparziele',
        icon: '💰',
        category: 'navigation' as CommandCategory,
        keywords: ['finanzen', 'finance', 'budget', 'geld'],
        priority: 54,
        action: () => navigateTo('finance'),
      },
      {
        id: 'learning',
        label: 'Lernen',
        description: 'Lernziele und Fortschritt',
        icon: '📖',
        category: 'ai-features' as CommandCategory,
        keywords: ['learn', 'aufgaben', 'training', 'lernziele'],
        priority: 50,
        action: () => navigateTo('learning'),
      },
      {
        id: 'voice-chat',
        label: 'Sprach-Chat',
        description: 'Echtzeit-Sprachkonversation mit der KI',
        icon: '🎙️',
        category: 'ai-features' as CommandCategory,
        keywords: ['voice', 'sprache', 'mikrofon', 'sprechen'],
        priority: 48,
        action: () => navigateTo('voice-chat'),
      },
      {
        id: 'screen-memory',
        label: 'Screen Memory',
        description: 'Bildschirmaktivität durchsuchen',
        icon: '🧠',
        category: 'ai-features' as CommandCategory,
        keywords: ['screen', 'memory', 'bildschirm', 'recall'],
        priority: 45,
        action: () => navigateTo('screen-memory'),
      },
      {
        id: 'canvas',
        label: 'Editor',
        description: 'Markdown/Code Editor',
        icon: '✏️',
        category: 'content' as CommandCategory,
        keywords: ['editor', 'canvas', 'markdown', 'code'],
        priority: 38,
        action: () => navigateTo('canvas'),
      },
      {
        id: 'meetings',
        label: 'Meetings',
        description: 'Meeting-Notizen im Planer',
        icon: '📅',
        category: 'content' as CommandCategory,
        keywords: ['meeting', 'termin', 'besprechung'],
        priority: 35,
        action: () => navigateTo('meetings'),
      },

      // === Quick Actions ===
    {
      id: 'action-new-idea',
      label: 'Neuer Gedanke',
      description: 'Schnell erfassen',
      icon: '➕',
      category: 'actions',
      keywords: ['neu', 'new', 'create', 'erstellen', 'gedanke', 'idee'],
      shortcut: 'Cmd+N',
      priority: 95,
      action: () => {
        onAction?.('new-idea');
        navigateTo('ideas');
      },
    },
    {
      id: 'action-new-task',
      label: 'Neue Aufgabe',
      description: 'Aufgabe erstellen',
      icon: '📌',
      category: 'actions',
      keywords: ['task', 'aufgabe', 'todo', 'erstellen'],
      priority: 90,
      action: () => {
        onAction?.('new-task');
        navigateTo('calendar');
      },
    },
    {
      id: 'action-new-email',
      label: 'Neue E-Mail',
      description: 'E-Mail verfassen',
      icon: '✉️',
      category: 'actions',
      keywords: ['email', 'mail', 'schreiben', 'verfassen', 'senden'],
      priority: 85,
      action: () => {
        onAction?.('new-email');
        navigateTo('email');
      },
    },
    {
      id: 'action-voice',
      label: 'Spracheingabe',
      description: 'Per Stimme diktieren',
      icon: '🎤',
      category: 'actions',
      keywords: ['voice', 'stimme', 'sprechen', 'mikro'],
      shortcut: 'Cmd+M',
      priority: 75,
      action: () => {
        onAction?.('voice-input');
        navigateTo('ideas');
      },
    },
    ];
  }, [navigateTo, onAction]);

  // Listen for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K opens palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    commands,
    recentPages,
  };
}
