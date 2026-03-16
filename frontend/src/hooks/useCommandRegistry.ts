/**
 * useCommandRegistry - Central command registration system
 *
 * Allows pages to register contextual commands that appear in CommandPalette.
 * Commands are automatically unregistered when the component unmounts.
 *
 * Usage:
 *   const { registerCommands } = useCommandRegistry();
 *   useEffect(() => {
 *     return registerCommands('ideas-page', [
 *       { id: 'new-idea', label: 'Neuer Gedanke', action: () => ... },
 *     ]);
 *   }, [registerCommands]);
 */

import { createContext, useContext, useCallback, useRef, useSyncExternalStore } from 'react';

export interface RegisteredCommand {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  shortcut?: string;
  action: () => void;
  /** Source page that registered this command */
  source: string;
  /** Higher = shown first */
  priority?: number;
}

type CommandRegistryListener = () => void;

class CommandRegistryStore {
  private commands = new Map<string, RegisteredCommand[]>();
  private listeners = new Set<CommandRegistryListener>();

  /** Register commands for a source (returns unregister function) */
  register(source: string, commands: Omit<RegisteredCommand, 'source'>[]): () => void {
    const registered = commands.map(cmd => ({ ...cmd, source }));
    this.commands.set(source, registered);
    this.notify();
    return () => {
      this.commands.delete(source);
      this.notify();
    };
  }

  /** Get all registered commands */
  getAll(): RegisteredCommand[] {
    const all: RegisteredCommand[] = [];
    for (const commands of this.commands.values()) {
      all.push(...commands);
    }
    return all;
  }

  /** Get snapshot for useSyncExternalStore */
  getSnapshot = (): RegisteredCommand[] => {
    return this.getAll();
  };

  /** Subscribe for useSyncExternalStore */
  subscribe = (listener: CommandRegistryListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// Singleton store
const registryStore = new CommandRegistryStore();

/** React Context for the registry (allows testing with custom stores) */
export const CommandRegistryContext = createContext<CommandRegistryStore>(registryStore);

/**
 * Hook to register page-specific commands.
 */
export function useCommandRegistry() {
  const store = useContext(CommandRegistryContext);
  const storeRef = useRef(store);
  storeRef.current = store;

  const registerCommands = useCallback(
    (source: string, commands: Omit<RegisteredCommand, 'source'>[]): (() => void) => {
      return storeRef.current.register(source, commands);
    },
    []
  );

  return { registerCommands };
}

/**
 * Hook to consume all registered commands (used by CommandPalette).
 */
export function useRegisteredCommands(): RegisteredCommand[] {
  const store = useContext(CommandRegistryContext);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
