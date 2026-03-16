import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Page } from '../types/idea';
import { formatShortcut } from '../hooks/useKeyboardShortcut';
import { useRegisteredCommands } from '../hooks/useCommandRegistry';
import { getGKeyLabel } from '../hooks/useKeyboardNavigation';
import './CommandPalette.css';

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
  universal: { label: '', color: '', placeholder: 'Seite, Aktion oder Befehl suchen...' },
  navigation: { label: '/', color: '#3b82f6', placeholder: 'Navigation...' },
  commands: { label: '>', color: '#8b5cf6', placeholder: 'Befehl ausfuehren...' },
  contacts: { label: '@', color: '#10b981', placeholder: 'Kontakt suchen...' },
  tags: { label: '#', color: '#f59e0b', placeholder: 'Tag suchen...' },
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
  recent: { label: 'Kuerzlich', icon: '🕐' },
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Consume page-registered commands
  const registeredCommands = useRegisteredCommands();

  // Determine mode from prefix
  const { mode, cleanQuery } = useMemo(() => {
    if (!query) return { mode: 'universal' as PaletteMode, cleanQuery: '' };
    const firstChar = query[0];
    const detectedMode = MODE_PREFIXES[firstChar];
    if (detectedMode) {
      return { mode: detectedMode, cleanQuery: query.slice(1).trimStart() };
    }
    return { mode: 'universal' as PaletteMode, cleanQuery: query };
  }, [query]);

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
      .map(r => r.item);
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

  if (!isOpen) return null;

  let currentIndex = -1;

  return createPortal(
    <div className="command-palette-overlay" onClick={onClose} role="presentation">
      <div
        className="command-palette"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Schnellnavigation"
      >
        {/* Search Input */}
        <div className="command-palette-header">
          <div className="command-palette-search">
            <span className="command-palette-search-icon" aria-hidden="true">
              🔍
            </span>
            {mode !== 'universal' && (
              <span
                className="command-palette-mode-pill"
                style={{ backgroundColor: modeInfo.color }}
              >
                {modeInfo.label}
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              className="command-palette-input"
              placeholder={modeInfo.placeholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <kbd className="command-palette-shortcut-hint">ESC</kbd>
          </div>
          {/* Mode hints */}
          {mode === 'universal' && !query && (
            <div className="command-palette-mode-hints">
              <span className="command-palette-mode-hint">
                <kbd>/</kbd> Navigation
              </span>
              <span className="command-palette-mode-hint">
                <kbd>&gt;</kbd> Befehle
              </span>
              <span className="command-palette-mode-hint">
                <kbd>@</kbd> Kontakte
              </span>
              <span className="command-palette-mode-hint">
                <kbd>#</kbd> Tags
              </span>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="command-palette-results" ref={listRef}>
          {flatList.length === 0 ? (
            <div className="command-palette-empty">
              <span className="command-palette-empty-icon">🔍</span>
              <p>Keine Ergebnisse fuer &quot;{cleanQuery}&quot;</p>
            </div>
          ) : (
            CATEGORY_ORDER.map(category => {
              const items = groupedCommands[category];
              if (items.length === 0) return null;

              const info = CATEGORY_INFO[category];

              return (
                <div key={category} className="command-palette-group">
                  <div className="command-palette-group-header">
                    <span className="command-palette-group-icon">{info.icon}</span>
                    <span className="command-palette-group-label">{info.label}</span>
                  </div>
                  <ul className="command-palette-list">
                    {items.map(command => {
                      currentIndex++;
                      const isSelected = currentIndex === selectedIndex;
                      const itemIndex = currentIndex;

                      return (
                        <li key={command.id}>
                          <button
                            type="button"
                            className={`command-palette-item ${isSelected ? 'selected' : ''}`}
                            data-selected={isSelected}
                            onClick={() => executeCommand(command)}
                            onMouseEnter={() => setSelectedIndex(itemIndex)}
                          >
                            <span className="command-palette-item-icon">{command.icon}</span>
                            <div className="command-palette-item-content">
                              <span className="command-palette-item-label">{command.label}</span>
                              {command.description && (
                                <span className="command-palette-item-description">
                                  {command.description}
                                </span>
                              )}
                            </div>
                            {command.shortcut && (
                              <kbd className="command-palette-item-shortcut">
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
        <div className="command-palette-footer">
          <div className="command-palette-footer-hints">
            <span className="command-palette-hint">
              <kbd>↑↓</kbd> navigieren
            </span>
            <span className="command-palette-hint">
              <kbd>↵</kbd> auswaehlen
            </span>
            <span className="command-palette-hint">
              <kbd>esc</kbd> schliessen
            </span>
          </div>
        </div>
      </div>
    </div>,
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

  // Build commands
  const commands: Command[] = useMemo(() => [
    // === Navigation (Main) ===
    {
      id: 'home',
      label: 'Dashboard',
      description: 'Startseite mit Uebersicht',
      icon: '🏠',
      category: 'navigation',
      keywords: ['home', 'start', 'dashboard', 'uebersicht', 'startseite'],
      shortcut: 'Cmd+H',
      priority: 105,
      action: () => navigateTo('home'),
    },
    {
      id: 'chat',
      label: 'Chat',
      description: 'Vollbild-Chat mit der KI',
      icon: '💬',
      category: 'navigation',
      keywords: ['chat', 'gespraech', 'fragen', 'konversation', 'zen'],
      priority: 102,
      action: () => navigateTo('chat'),
    },
    {
      id: 'browser',
      label: 'Browser',
      description: 'Webseiten durchsuchen & speichern',
      icon: '🌐',
      category: 'navigation',
      keywords: ['browser', 'web', 'internet', 'surfen', 'seiten', 'lesezeichen'],
      priority: 101,
      action: () => navigateTo('browser'),
    },
    {
      id: 'contacts',
      label: 'Kontakte',
      description: 'Kontakte & Organisationen verwalten',
      icon: '👥',
      category: 'navigation',
      keywords: ['kontakte', 'contacts', 'personen', 'organisationen', 'crm', 'adressbuch'],
      priority: 100,
      action: () => navigateTo('contacts'),
    },
    {
      id: 'finance',
      label: 'Finanzen',
      description: 'Ausgaben, Budgets & Sparziele verwalten',
      icon: '💰',
      category: 'navigation',
      keywords: ['finanzen', 'finance', 'ausgaben', 'budget', 'geld', 'sparen', 'transaktionen', 'konto'],
      priority: 99,
      action: () => navigateTo('finance'),
    },
    {
      id: 'ideas',
      label: 'Gedanken',
      description: 'Ideen erfassen und entwickeln',
      icon: '💭',
      category: 'navigation',
      keywords: ['ideas', 'gedanken', 'ideen', 'erfassen'],
      priority: 99,
      action: () => navigateTo('ideas'),
    },
    {
      id: 'insights',
      label: 'Insights',
      description: 'Statistiken, Trends und Verbindungen',
      icon: '📊',
      category: 'navigation',
      keywords: ['dashboard', 'analytics', 'statistik', 'graph', 'trends'],
      priority: 90,
      action: () => navigateTo('insights'),
    },
    {
      id: 'documents',
      label: 'Wissensbasis',
      description: 'Dokumente, Editor, Medien und Meetings',
      icon: '📚',
      category: 'navigation',
      keywords: ['dokumente', 'wissensbasis', 'editor', 'medien', 'documents'],
      priority: 85,
      action: () => navigateTo('documents'),
    },
    {
      id: 'settings',
      label: 'Einstellungen',
      description: 'Profil, Automationen, Integrationen und mehr',
      icon: '⚙️',
      category: 'navigation',
      keywords: ['settings', 'config', 'optionen', 'einstellungen'],
      shortcut: 'Cmd+,',
      priority: 70,
      action: () => navigateTo('settings'),
    },

    // === Organisieren ===
    {
      id: 'calendar',
      label: 'Planer',
      description: 'Kalender, Aufgaben & Projekte',
      icon: '📋',
      category: 'navigation',
      keywords: ['kalender', 'planer', 'aufgaben', 'termine', 'tasks', 'projekte', 'gantt', 'kanban'],
      priority: 98,
      action: () => navigateTo('calendar'),
    },
    {
      id: 'email',
      label: 'E-Mail',
      description: 'E-Mails senden & empfangen',
      icon: '✉️',
      category: 'navigation',
      keywords: ['email', 'mail', 'nachricht', 'postfach', 'inbox', 'senden'],
      priority: 97,
      action: () => navigateTo('email'),
    },
    {
      id: 'notifications',
      label: 'Unified Inbox',
      description: 'Alle Benachrichtigungen & offene Punkte',
      icon: '📥',
      category: 'navigation',
      keywords: ['inbox', 'benachrichtigungen', 'notifications', 'faellig', 'aufgaben', 'follow-up'],
      priority: 96,
      action: () => navigateTo('notifications'),
    },

    // === Ideen ===
    {
      id: 'incubator',
      label: 'Inkubator',
      description: 'Lose Gedanken reifen lassen',
      icon: '🧫',
      category: 'ai-features',
      keywords: ['inkubator', 'incubator', 'cluster', 'reifen'],
      priority: 80,
      action: () => navigateTo('incubator'),
    },
    {
      id: 'triage',
      label: 'Sortieren',
      description: 'Gedanken einordnen',
      icon: '🎯',
      category: 'ai-features',
      keywords: ['sort', 'kategorisieren', 'einordnen', 'triage'],
      priority: 75,
      action: () => navigateTo('triage'),
    },
    {
      id: 'archive',
      label: 'Archiv',
      description: 'Archivierte Gedanken',
      icon: '📥',
      category: 'ai-features',
      keywords: ['archiv', 'geloescht', 'alt'],
      priority: 72,
      action: () => navigateTo('archive'),
    },
    {
      id: 'workshop',
      label: 'Werkstatt',
      description: 'KI-Vorschlaege und Agenten',
      icon: '🧪',
      category: 'ai-features',
      keywords: ['werkstatt', 'workshop', 'ki', 'ai', 'proaktiv', 'evolution'],
      priority: 82,
      action: () => navigateTo('workshop'),
    },
    {
      id: 'agent-teams',
      label: 'Agent Teams',
      description: 'Multi-Agent Aufgaben orchestrieren',
      icon: '🤖',
      category: 'ai-features',
      keywords: ['agent', 'team', 'multi', 'researcher', 'writer', 'reviewer'],
      priority: 53,
      action: () => navigateTo('agent-teams'),
    },

    // === KI & Lernen ===
    {
      id: 'learning',
      label: 'Lernen',
      description: 'Lernziele und Fortschritt',
      icon: '📖',
      category: 'ai-features',
      keywords: ['learn', 'aufgaben', 'training', 'lernziele'],
      priority: 60,
      action: () => navigateTo('learning'),
    },
    {
      id: 'my-ai',
      label: 'Meine KI',
      description: 'Personalisierung, KI-Wissen und Sprach-Chat',
      icon: '🤖',
      category: 'ai-features',
      keywords: ['persona', 'anpassen', 'stil', 'meine ki', 'personalisierung'],
      priority: 58,
      action: () => navigateTo('my-ai'),
    },
    {
      id: 'voice-chat',
      label: 'Sprach-Chat',
      description: 'Echtzeit-Sprachkonversation mit der KI',
      icon: '🎙️',
      category: 'ai-features',
      keywords: ['voice', 'sprache', 'mikrofon', 'sprechen', 'reden', 'stimme'],
      priority: 52,
      action: () => navigateTo('voice-chat'),
    },
    {
      id: 'screen-memory',
      label: 'Screen Memory',
      description: 'Bildschirmaktivitaet durchsuchen',
      icon: '🧠',
      category: 'ai-features',
      keywords: ['screen', 'memory', 'bildschirm', 'screenshot', 'aktivitaet', 'timeline', 'recall'],
      priority: 50,
      action: () => navigateTo('screen-memory'),
    },

    // === Inhalte ===
    {
      id: 'meetings',
      label: 'Meetings',
      description: 'Meeting-Notizen in der Wissensbasis',
      icon: '📅',
      category: 'content',
      keywords: ['meeting', 'termin', 'besprechung'],
      priority: 45,
      action: () => navigateTo('meetings'),
    },
    {
      id: 'media',
      label: 'Medien',
      description: 'Bilder & Dateien in der Wissensbasis',
      icon: '🖼️',
      category: 'content',
      keywords: ['bilder', 'fotos', 'dateien', 'upload'],
      priority: 40,
      action: () => navigateTo('media'),
    },
    {
      id: 'canvas',
      label: 'Editor',
      description: 'Markdown/Code Editor',
      icon: '✏️',
      category: 'content',
      keywords: ['editor', 'canvas', 'markdown', 'code', 'schreiben'],
      priority: 38,
      action: () => navigateTo('canvas'),
    },
    {
      id: 'business',
      label: 'Business',
      description: 'Umsatz, Traffic, SEO und Berichte',
      icon: '💼',
      category: 'content',
      keywords: ['business', 'umsatz', 'revenue', 'traffic', 'seo'],
      priority: 35,
      action: () => navigateTo('business'),
    },

    // === Einstellungen ===
    {
      id: 'automations',
      label: 'Automationen',
      description: 'Automatische Workflows',
      icon: '⚡',
      category: 'settings',
      keywords: ['automation', 'workflow', 'regel'],
      priority: 30,
      action: () => navigateTo('automations'),
    },
    {
      id: 'integrations',
      label: 'Integrationen',
      description: 'OAuth, API Keys, Webhooks',
      icon: '🔗',
      category: 'settings',
      keywords: ['api', 'webhook', 'connect', 'oauth'],
      priority: 25,
      action: () => navigateTo('integrations'),
    },
    {
      id: 'profile',
      label: 'Profil',
      description: 'Benutzerprofil und Business-Daten',
      icon: '👤',
      category: 'settings',
      keywords: ['user', 'account', 'konto', 'profil'],
      priority: 20,
      action: () => navigateTo('profile'),
    },
    {
      id: 'export',
      label: 'Daten',
      description: 'Export und Synchronisation',
      icon: '📦',
      category: 'settings',
      keywords: ['download', 'backup', 'sichern', 'export', 'sync', 'daten'],
      priority: 10,
      action: () => navigateTo('export'),
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
  ], [navigateTo, onAction]);

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
