import { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { formatShortcut } from '../hooks/useKeyboardShortcut';
import './KeyboardShortcutsModal.css';

interface ShortcutItem {
  action: string;
  shortcut: string;
  description?: string;
}

interface ShortcutCategory {
  name: string;
  icon: string;
  shortcuts: ShortcutItem[];
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Shortcut categories organized by function
 */
const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: 'Navigation',
    icon: '\uD83E\uDDED', // compass
    shortcuts: [
      { action: 'Startseite', shortcut: 'Cmd+H', description: 'Zur Hauptansicht' },
      { action: 'Suche', shortcut: 'Cmd+K', description: 'Schnellsuche \u00F6ffnen' },
      { action: 'Archiv', shortcut: 'Cmd+A', description: 'Archiv anzeigen' },
      { action: 'Einstellungen', shortcut: 'Cmd+,', description: 'Einstellungen \u00F6ffnen' },
    ],
  },
  {
    name: 'Gedanken',
    icon: '\uD83D\uDCA1', // lightbulb
    shortcuts: [
      { action: 'Neuer Gedanke', shortcut: 'Cmd+N', description: 'Neue Idee erfassen' },
      { action: 'Speichern', shortcut: 'Cmd+S', description: '\u00C4nderungen sichern' },
      { action: 'Spracheingabe', shortcut: 'Cmd+M', description: 'Per Stimme diktieren' },
      { action: 'Favorit', shortcut: 'Cmd+D', description: 'Als Favorit markieren' },
      { action: 'Teilen', shortcut: 'Cmd+Shift+S', description: 'Gedanke teilen' },
    ],
  },
  {
    name: 'Ansichten',
    icon: '\uD83D\uDCCB', // clipboard
    shortcuts: [
      { action: 'Kachel-Ansicht', shortcut: 'Cmd+1', description: 'Gedanken als Kacheln' },
      { action: 'Listen-Ansicht', shortcut: 'Cmd+2', description: 'Gedanken als Liste' },
      { action: 'Graph-Ansicht', shortcut: 'Cmd+3', description: 'Verbindungen visualisieren' },
    ],
  },
  {
    name: 'Allgemein',
    icon: '\u2328\uFE0F', // keyboard
    shortcuts: [
      { action: 'Hilfe', shortcut: 'Cmd+?', description: 'Diese Hilfe anzeigen' },
      { action: 'Schlie\u00DFen', shortcut: 'Escape', description: 'Dialog schlie\u00DFen' },
    ],
  },
];

/**
 * Keyboard Shortcuts Modal
 * Shows all available keyboard shortcuts organized by category
 * Opens with ? or Cmd+/
 */
export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div className="keyboard-shortcuts-overlay" onClick={onClose} role="presentation">
      <div
        className="keyboard-shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <header className="shortcuts-header">
          <h2 id="shortcuts-title" className="shortcuts-title">
            <span className="shortcuts-icon" aria-hidden="true">{'\u2328\uFE0F'}</span>
            Tastenkombinationen
          </h2>
          <button
            type="button"
            className="shortcuts-close neuro-press-effect"
            onClick={onClose}
            aria-label="Schließen"
          >
            {'\u00D7'}
          </button>
        </header>

        <div className="shortcuts-content">
          {SHORTCUT_CATEGORIES.map((category) => (
            <section key={category.name} className="shortcuts-category">
              <h3 className="category-title">
                <span className="category-icon" aria-hidden="true">{category.icon}</span>
                {category.name}
              </h3>
              <ul className="shortcuts-list">
                {category.shortcuts.map((item) => (
                  <li key={item.action} className="shortcut-item">
                    <div className="shortcut-info">
                      <span className="shortcut-action">{item.action}</span>
                      {item.description && (
                        <span className="shortcut-description">{item.description}</span>
                      )}
                    </div>
                    <kbd className="shortcut-key">{formatShortcut(item.shortcut)}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="shortcuts-footer">
          <p className="shortcuts-hint">
            Drücke <kbd>?</kbd> um diese Hilfe jederzeit anzuzeigen
          </p>
        </footer>
      </div>
    </div>,
    document.body
  );
});

/**
 * Hook to manage keyboard shortcuts modal state
 * Listens for ? or Cmd+/ to open the modal
 */
export function useKeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in input fields, textareas, or contenteditable elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Open with ? (without modifiers) or Cmd+/
      if (
        (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) ||
        (e.key === '/' && (e.metaKey || e.ctrlKey))
      ) {
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
  };
}

