/**
 * LayoutModeContext — Workspace Layout State
 *
 * Manages chat drawer and sidebar state.
 * Persists preferences to localStorage.
 */

import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';

export type LayoutMode = 'workspace';

interface LayoutModeState {
  mode: LayoutMode;
  chatDrawerOpen: boolean;
  chatDrawerWidth: number;
  sidebarCollapsed: boolean;
}

type LayoutAction =
  | { type: 'SET_MODE'; mode: LayoutMode }
  | { type: 'TOGGLE_CHAT_DRAWER' }
  | { type: 'SET_CHAT_DRAWER_WIDTH'; width: number }
  | { type: 'TOGGLE_SIDEBAR' };

const STORAGE_KEYS = {
  chatWidth: 'zenai-chat-drawer-width',
  chatOpen: 'zenai-chat-drawer-open',
  sidebarCollapsed: 'zenai-sidebar-collapsed',
} as const;

function loadInitialState(): LayoutModeState {
  return {
    mode: 'workspace',
    chatDrawerOpen: localStorage.getItem(STORAGE_KEYS.chatOpen) === 'true',
    chatDrawerWidth: Number(localStorage.getItem(STORAGE_KEYS.chatWidth)) || 400,
    sidebarCollapsed: localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === 'true',
  };
}

function layoutReducer(state: LayoutModeState, action: LayoutAction): LayoutModeState {
  switch (action.type) {
    case 'SET_MODE':
      return state; // No-op: only workspace mode exists now
    case 'TOGGLE_CHAT_DRAWER':
      return { ...state, chatDrawerOpen: !state.chatDrawerOpen };
    case 'SET_CHAT_DRAWER_WIDTH': {
      const width = Math.max(300, Math.min(600, action.width));
      return { ...state, chatDrawerWidth: width };
    }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    default:
      return state;
  }
}

interface LayoutModeContextValue {
  state: LayoutModeState;
  dispatch: React.Dispatch<LayoutAction>;
}

const LayoutModeContext = createContext<LayoutModeContextValue | null>(null);

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(layoutReducer, undefined, loadInitialState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.chatWidth, String(state.chatDrawerWidth));
  }, [state.chatDrawerWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.chatOpen, String(state.chatDrawerOpen));
  }, [state.chatDrawerOpen]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, String(state.sidebarCollapsed));
  }, [state.sidebarCollapsed]);

  return (
    <LayoutModeContext.Provider value={{ state, dispatch }}>
      {children}
    </LayoutModeContext.Provider>
  );
}

export function useLayoutMode() {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) throw new Error('useLayoutMode must be used within LayoutModeProvider');
  return ctx;
}

const FALLBACK_STATE: LayoutModeState = {
  mode: 'workspace',
  chatDrawerOpen: false,
  chatDrawerWidth: 400,
  sidebarCollapsed: false,
};
const noop = (() => {}) as React.Dispatch<LayoutAction>;

/** Safe variant that returns defaults when outside the provider (e.g. in tests). */
export function useLayoutModeSafe() {
  const ctx = useContext(LayoutModeContext);
  return ctx ?? { state: FALLBACK_STATE, dispatch: noop };
}
