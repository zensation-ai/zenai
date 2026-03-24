import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode, type Dispatch } from 'react';
import { useSearchParams } from 'react-router-dom';

export type PanelType = 'tasks' | 'email' | 'ideas' | 'calendar' | 'contacts'
  | 'documents' | 'memory' | 'finance' | 'agents' | 'search'
  | 'settings' | 'dashboard';

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

export function savePanelWidth(panelType: PanelType, width: number): void {
  try {
    localStorage.setItem(`panel-width-${panelType}`, String(width));
  } catch { /* quota exceeded — ignore */ }
}

export function loadPanelWidth(panelType: PanelType): number | null {
  try {
    const raw = localStorage.getItem(`panel-width-${panelType}`);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const initialPanelState: PanelState = {
  activePanel: null,
  pinned: false,
  width: DEFAULT_WIDTH,
};

const VALID_PANELS: PanelType[] = [
  'tasks', 'email', 'ideas', 'calendar', 'contacts',
  'documents', 'memory', 'finance', 'agents', 'search',
  'settings', 'dashboard',
];

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'OPEN_PANEL': {
      const savedWidth = loadPanelWidth(action.panel);
      return {
        ...state,
        activePanel: action.panel,
        pinned: false,
        filter: action.filter,
        width: savedWidth ?? DEFAULT_WIDTH,
      };
    }
    case 'CLOSE_PANEL':
      return {
        ...state,
        activePanel: null,
        pinned: false,
        filter: undefined,
      };
    case 'TOGGLE_PIN':
      return { ...state, pinned: !state.pinned };
    case 'SET_WIDTH': {
      const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, action.width));
      if (state.activePanel) {
        savePanelWidth(state.activePanel, clamped);
      }
      return {
        ...state,
        width: clamped,
      };
    }
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
  const [searchParams, setSearchParams] = useSearchParams();
  const isInitialMount = useRef(true);
  const isProgrammaticUpdate = useRef(false);

  // On mount: read URL → open panel if specified
  useEffect(() => {
    const panel = searchParams.get('panel') as PanelType | null;
    const filter = searchParams.get('filter') ?? undefined;
    if (panel && VALID_PANELS.includes(panel)) {
      dispatch({ type: 'OPEN_PANEL', panel, filter });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // On state change: update URL
  useEffect(() => {
    // Skip the initial render to avoid overwriting URL before mount-read fires
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    isProgrammaticUpdate.current = true;
    if (state.activePanel) {
      const params: Record<string, string> = { panel: state.activePanel };
      if (state.filter) {
        params.filter = state.filter;
      }
      setSearchParams(params, { replace: true });
    } else {
      // Panel closed — remove query params
      setSearchParams({}, { replace: true });
    }
  }, [state.activePanel, state.filter, setSearchParams]);

  // On URL change (browser back/forward): sync state
  useEffect(() => {
    if (isInitialMount.current) return;
    if (isProgrammaticUpdate.current) {
      isProgrammaticUpdate.current = false;
      return;
    }
    const urlPanel = searchParams.get('panel') as PanelType | null;
    const urlFilter = searchParams.get('filter') ?? undefined;
    if (urlPanel && VALID_PANELS.includes(urlPanel)) {
      if (urlPanel !== state.activePanel) {
        dispatch({ type: 'OPEN_PANEL', panel: urlPanel, filter: urlFilter });
      }
    } else if (state.activePanel !== null) {
      dispatch({ type: 'CLOSE_PANEL' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
