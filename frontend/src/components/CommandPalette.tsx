import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Page } from '../types/idea';
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

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  recentPages?: string[];
}

// ============================================
// Fuzzy Search
// ============================================

/**
 * Simple fuzzy search - matches if all characters appear in order
 * Returns match score (lower = better match)
 */
function fuzzyMatch(query: string, text: string): { matches: boolean; score: number } {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  if (!query) return { matches: true, score: 0 };

  // Exact match gets best score
  if (textLower === queryLower) return { matches: true, score: -100 };

  // Starts with query
  if (textLower.startsWith(queryLower)) return { matches: true, score: -50 };

  // Contains query as substring
  if (textLower.includes(queryLower)) return { matches: true, score: -25 };

  // Fuzzy match: all chars in order
  let queryIndex = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        score -= 5;
      }
      // Bonus for match at word boundary
      if (i === 0 || textLower[i - 1] === ' ' || textLower[i - 1] === '-') {
        score -= 10;
      }
      lastMatchIndex = i;
      queryIndex++;
    } else {
      score += 1;
    }
  }

  return {
    matches: queryIndex === queryLower.length,
    score
  };
}

function searchCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) {
    // Sort by priority when no query
    return [...commands].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  const results: { command: Command; score: number }[] = [];

  for (const command of commands) {
    // Search in label
    const labelMatch = fuzzyMatch(query, command.label);

    // Search in description
    const descMatch = command.description
      ? fuzzyMatch(query, command.description)
      : { matches: false, score: 1000 };

    // Search in keywords
    let keywordScore = 1000;
    if (command.keywords) {
      for (const keyword of command.keywords) {
        const kwMatch = fuzzyMatch(query, keyword);
        if (kwMatch.matches && kwMatch.score < keywordScore) {
          keywordScore = kwMatch.score;
        }
      }
    }

    // Take best match
    const bestScore = Math.min(
      labelMatch.matches ? labelMatch.score : 1000,
      descMatch.matches ? descMatch.score + 10 : 1000,
      keywordScore + 5
    );

    if (labelMatch.matches || descMatch.matches || keywordScore < 1000) {
      results.push({
        command,
        score: bestScore - (command.priority || 0) * 0.1
      });
    }
  }

  // Sort by score (lower is better)
  return results
    .sort((a, b) => a.score - b.score)
    .map(r => r.command);
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
  'navigation',
  'ai-features',
  'content',
  'settings',
  'actions',
];

// ============================================
// Format Shortcut Helper
// ============================================

function formatShortcut(shortcut: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return shortcut
    .replace(/Cmd/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/\+/g, '');
}

// ============================================
// Command Palette Component
// ============================================

export const CommandPalette = memo(function CommandPalette({
  isOpen,
  onClose,
  commands,
  recentPages = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build commands with recent pages boosted
  const allCommands = useMemo(() => {
    return commands.map(cmd => ({
      ...cmd,
      priority: recentPages.includes(cmd.id)
        ? (cmd.priority || 0) + 100
        : cmd.priority,
      category: recentPages.includes(cmd.id) ? 'recent' as CommandCategory : cmd.category,
    }));
  }, [commands, recentPages]);

  // Search results
  const filteredCommands = useMemo(
    () => searchCommands(allCommands, query),
    [allCommands, query]
  );

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
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
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
          flatList[selectedIndex].action();
          onClose();
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
    }
  }, [flatList, selectedIndex, onClose]);

  // Execute command
  const executeCommand = useCallback((command: Command) => {
    command.action();
    onClose();
  }, [onClose]);

  // Global escape handler
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
            <input
              ref={inputRef}
              type="text"
              className="command-palette-input"
              placeholder="Seite oder Aktion suchen..."
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
        </div>

        {/* Results */}
        <div className="command-palette-results" ref={listRef}>
          {flatList.length === 0 ? (
            <div className="command-palette-empty">
              <span className="command-palette-empty-icon">🔍</span>
              <p>Keine Ergebnisse für "{query}"</p>
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
              <kbd>↵</kbd> auswählen
            </span>
            <span className="command-palette-hint">
              <kbd>esc</kbd> schließen
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});

// ============================================
// Hook for Command Palette
// ============================================

interface UseCommandPaletteOptions {
  onNavigate: (page: Page) => void;
  onAction?: (action: string) => void;
}

export function useCommandPalette({ onNavigate, onAction }: UseCommandPaletteOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentPages, setRecentPages] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('zenai-recent-pages');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save recent pages
  const addRecentPage = useCallback((pageId: string) => {
    setRecentPages(prev => {
      const filtered = prev.filter(p => p !== pageId);
      const updated = [pageId, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('zenai-recent-pages', JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  }, []);

  // Navigate and track
  const navigateTo = useCallback((page: Page) => {
    addRecentPage(page);
    onNavigate(page);
  }, [addRecentPage, onNavigate]);

  // Build commands
  const commands: Command[] = useMemo(() => [
    // === Navigation (Main) ===
    {
      id: 'ideas',
      label: 'Gedanken',
      description: 'Hauptansicht mit Chat',
      icon: '💭',
      category: 'navigation',
      keywords: ['home', 'start', 'ideas', 'chat', 'gespräch'],
      shortcut: 'Cmd+H',
      priority: 100,
      action: () => navigateTo('ideas'),
    },
    {
      id: 'insights',
      label: 'Insights',
      description: 'Dashboard & Analytics',
      icon: '📊',
      category: 'navigation',
      keywords: ['dashboard', 'analytics', 'statistik', 'graph'],
      priority: 90,
      action: () => navigateTo('insights'),
    },
    {
      id: 'archive',
      label: 'Archiv',
      description: 'Archivierte Gedanken',
      icon: '📥',
      category: 'navigation',
      keywords: ['archiv', 'gelöscht', 'alt'],
      shortcut: 'Cmd+A',
      priority: 80,
      action: () => navigateTo('archive'),
    },
    {
      id: 'settings',
      label: 'Einstellungen',
      description: 'Alle Einstellungen',
      icon: '⚙️',
      category: 'navigation',
      keywords: ['settings', 'config', 'optionen'],
      shortcut: 'Cmd+,',
      priority: 70,
      action: () => navigateTo('settings'),
    },

    // === KI-Features ===
    {
      id: 'ai-workshop',
      label: 'KI-Workshop',
      description: 'Inkubator & Proaktive KI',
      icon: '🧪',
      category: 'ai-features',
      keywords: ['inkubator', 'incubator', 'workshop', 'ki', 'ai', 'proaktiv', 'evolution'],
      priority: 85,
      action: () => navigateTo('ai-workshop'),
    },
    {
      id: 'learning',
      label: 'Lernen',
      description: 'KI-Lernaufgaben',
      icon: '📚',
      category: 'ai-features',
      keywords: ['learn', 'aufgaben', 'training'],
      priority: 60,
      action: () => navigateTo('learning'),
    },
    {
      id: 'triage',
      label: 'Sortieren',
      description: 'Gedanken einordnen',
      icon: '🎯',
      category: 'ai-features',
      keywords: ['sort', 'kategorisieren', 'einordnen', 'triage'],
      priority: 55,
      action: () => navigateTo('triage'),
    },
    {
      id: 'personalization',
      label: 'Personalisierung',
      description: 'KI-Persönlichkeit anpassen',
      icon: '🎨',
      category: 'ai-features',
      keywords: ['persona', 'anpassen', 'stil'],
      priority: 50,
      action: () => navigateTo('personalization'),
    },

    // === Inhalte ===
    {
      id: 'meetings',
      label: 'Meetings',
      description: 'Meeting-Notizen',
      icon: '📅',
      category: 'content',
      keywords: ['meeting', 'termin', 'besprechung'],
      priority: 45,
      action: () => navigateTo('meetings'),
    },
    {
      id: 'media',
      label: 'Medien',
      description: 'Bilder & Dateien',
      icon: '🖼️',
      category: 'content',
      keywords: ['bilder', 'fotos', 'dateien', 'upload'],
      priority: 40,
      action: () => navigateTo('media'),
    },
    {
      id: 'stories',
      label: 'Stories',
      description: 'Geschichten & Texte',
      icon: '📖',
      category: 'content',
      keywords: ['story', 'text', 'artikel'],
      priority: 35,
      action: () => navigateTo('stories'),
    },

    // === Einstellungen ===
    {
      id: 'automations',
      label: 'Automationen',
      description: 'Automatische Workflows',
      icon: '🔄',
      category: 'settings',
      keywords: ['automation', 'workflow', 'regel'],
      priority: 30,
      action: () => navigateTo('automations'),
    },
    {
      id: 'integrations',
      label: 'Integrationen',
      description: 'Externe Dienste verbinden',
      icon: '🔌',
      category: 'settings',
      keywords: ['api', 'webhook', 'connect'],
      priority: 25,
      action: () => navigateTo('integrations'),
    },
    {
      id: 'profile',
      label: 'Profil',
      description: 'Dein Profil bearbeiten',
      icon: '👤',
      category: 'settings',
      keywords: ['user', 'account', 'konto'],
      priority: 20,
      action: () => navigateTo('profile'),
    },
    {
      id: 'notifications',
      label: 'Benachrichtigungen',
      description: 'Benachrichtigungen verwalten',
      icon: '🔔',
      category: 'settings',
      keywords: ['notification', 'alert', 'meldung'],
      priority: 15,
      action: () => navigateTo('notifications'),
    },
    {
      id: 'export',
      label: 'Export',
      description: 'Daten exportieren',
      icon: '📤',
      category: 'settings',
      keywords: ['download', 'backup', 'sichern'],
      priority: 10,
      action: () => navigateTo('export'),
    },
    {
      id: 'sync',
      label: 'Sync',
      description: 'Geräte synchronisieren',
      icon: '☁️',
      category: 'settings',
      keywords: ['cloud', 'synchron', 'geräte'],
      priority: 5,
      action: () => navigateTo('sync'),
    },

    // === Quick Actions ===
    {
      id: 'action-new-idea',
      label: 'Neuer Gedanke',
      description: 'Schnell erfassen',
      icon: '➕',
      category: 'actions',
      keywords: ['neu', 'new', 'create', 'erstellen'],
      shortcut: 'Cmd+N',
      priority: 95,
      action: () => {
        onAction?.('new-idea');
        navigateTo('ideas');
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
    addRecentPage,
  };
}
