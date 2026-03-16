/**
 * useCommandRegistry - Central Command Registration System
 *
 * Pages register their context-specific commands here.
 * The CommandPalette consumes the unified command list.
 *
 * Phase 82: Keyboard-First & Command System
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Page } from '../types';

// ============================================
// Types
// ============================================

export type CommandCategory =
  | 'navigation'
  | 'ai-features'
  | 'content'
  | 'settings'
  | 'actions'
  | 'recent'
  | 'search-results';

export interface RegisteredCommand {
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
  /** Page context where this command is most relevant */
  context?: Page;
}

interface CommandRegistration {
  sourceId: string;
  commands: RegisteredCommand[];
}

// ============================================
// Hook
// ============================================

export function useCommandRegistry() {
  const [registrations, setRegistrations] = useState<Map<string, CommandRegistration>>(new Map());
  const registrationsRef = useRef(registrations);
  registrationsRef.current = registrations;

  /**
   * Register commands from a source (e.g., a page component).
   * Call with an empty array to unregister.
   */
  const registerCommands = useCallback((sourceId: string, commands: RegisteredCommand[]) => {
    setRegistrations(prev => {
      const next = new Map(prev);
      if (commands.length === 0) {
        next.delete(sourceId);
      } else {
        next.set(sourceId, { sourceId, commands });
      }
      return next;
    });
  }, []);

  /**
   * Unregister all commands from a source
   */
  const unregisterCommands = useCallback((sourceId: string) => {
    setRegistrations(prev => {
      const next = new Map(prev);
      next.delete(sourceId);
      return next;
    });
  }, []);

  /**
   * All registered commands flattened
   */
  const allCommands = useMemo(() => {
    const commands: RegisteredCommand[] = [];
    for (const reg of registrations.values()) {
      commands.push(...reg.commands);
    }
    return commands;
  }, [registrations]);

  return {
    registerCommands,
    unregisterCommands,
    allCommands,
  };
}

/**
 * Hook for pages to register their context-specific commands.
 * Auto-unregisters on unmount.
 */
export function usePageCommands(
  sourceId: string,
  commands: RegisteredCommand[],
  registerCommands: (sourceId: string, commands: RegisteredCommand[]) => void,
  unregisterCommands: (sourceId: string) => void
) {
  useEffect(() => {
    registerCommands(sourceId, commands);
    return () => unregisterCommands(sourceId);
  }, [sourceId, commands, registerCommands, unregisterCommands]);
}
