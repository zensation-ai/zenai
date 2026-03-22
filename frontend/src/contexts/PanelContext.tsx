import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

export type PanelType = 'tasks' | 'email' | 'ideas' | 'calendar' | 'contacts'
  | 'documents' | 'memory' | 'finance' | 'agents' | 'search';

export type PanelState = {
  activePanel: PanelType | null;
  pinned: boolean;
  width: number;
  filter?: string;
};

export type PanelAction =
  | { type: 'OPEN_PANEL'; panel: PanelType; filter?: string }
  | { type: 'CLOSE_PANEL' }
  | { type: 'TOGGLE_PIN' }
  | { type: 'SET_WIDTH'; width: number };

const MIN_WIDTH = 360;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 420;

export const initialPanelState: PanelState = {
  activePanel: null,
  pinned: false,
  width: DEFAULT_WIDTH,
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'OPEN_PANEL':
      return {
        ...state,
        activePanel: action.panel,
        pinned: false,
        filter: action.filter,
      };
    case 'CLOSE_PANEL':
      return {
        ...state,
        activePanel: null,
        pinned: false,
        filter: undefined,
      };
    case 'TOGGLE_PIN':
      return { ...state, pinned: !state.pinned };
    case 'SET_WIDTH':
      return {
        ...state,
        width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, action.width)),
      };
    default:
      return state;
  }
}

interface PanelContextValue {
  state: PanelState;
  dispatch: Dispatch<PanelAction>;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  return (
    <PanelContext.Provider value={{ state, dispatch }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanelContext(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanelContext must be used within PanelProvider');
  return ctx;
}
