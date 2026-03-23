import { useEffect } from 'react';
import type { PanelType } from '../../contexts/PanelContext';

const PANEL_KEYS: Record<string, PanelType> = {
  '1': 'tasks',
  '2': 'email',
  '3': 'ideas',
  '4': 'calendar',
  '5': 'contacts',
  '6': 'documents',
  '7': 'memory',
  '8': 'finance',
  '9': 'agents',
  '/': 'search',
};

interface UseCockpitShortcutsOptions {
  onOpenPanel: (panel: PanelType) => void;
  onClosePanel: () => void;
  onNavigate: (path: string) => void;
  onNewTab?: () => void;
  onPrevTab?: () => void;
  onNextTab?: () => void;
  onCloseTab?: () => void;
  enabled?: boolean;
}

function isInputTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useCockpitShortcuts({
  onOpenPanel,
  onClosePanel,
  onNavigate,
  onNewTab,
  onPrevTab,
  onNextTab,
  onCloseTab,
  enabled = true,
}: UseCockpitShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const inInput = isInputTarget(e.target);

      // Escape always works (even in inputs) — closes panel
      if (e.key === 'Escape') {
        onClosePanel();
        return;
      }

      // All other shortcuts blocked in input fields
      if (inInput) return;

      if (mod) {
        // Cmd/Ctrl + 1-9 or / → open panel
        const panel = PANEL_KEYS[e.key];
        if (panel) {
          e.preventDefault();
          onOpenPanel(panel);
          return;
        }

        // Cmd+D → dashboard
        if (e.key === 'd') {
          e.preventDefault();
          onNavigate('/dashboard');
          return;
        }

        // Cmd+, → settings
        if (e.key === ',') {
          e.preventDefault();
          onNavigate('/settings');
          return;
        }

        // Cmd+T → new tab
        if (e.key === 't') {
          e.preventDefault();
          onNewTab?.();
          return;
        }

        // Cmd+[ → prev tab
        if (e.key === '[') {
          e.preventDefault();
          onPrevTab?.();
          return;
        }

        // Cmd+] → next tab
        if (e.key === ']') {
          e.preventDefault();
          onNextTab?.();
          return;
        }
      }

      // Alt+W → close tab (not Cmd+W which is browser-reserved)
      if (e.altKey && e.key === 'w') {
        e.preventDefault();
        onCloseTab?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onOpenPanel, onClosePanel, onNavigate, onNewTab, onPrevTab, onNextTab, onCloseTab]);
}
