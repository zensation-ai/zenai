/**
 * App Context
 *
 * Provides centralized state management across the application.
 * Eliminates prop drilling by making state and actions available via context.
 *
 * Usage:
 * ```tsx
 * // In a component
 * const { state, setPage, addIdea } = useAppContext();
 * ```
 */

import { createContext, useContext, ReactNode } from 'react';
import { useAppReducer, type AppDispatch } from '../hooks/useAppReducer';
import type { AppState } from '../types/appState';
import { safeLocalStorage } from '../utils/storage';

/**
 * Context value type
 * Combines state with all bound action dispatchers
 */
type AppContextValue = {
  state: AppState;
} & Omit<AppDispatch, 'state' | 'dispatch'>;

const AppContext = createContext<AppContextValue | null>(null);

/**
 * App Provider Props
 */
interface AppProviderProps {
  children: ReactNode;
}

/**
 * App Provider
 * Wraps the application and provides state management context
 */
export function AppProvider({ children }: AppProviderProps) {
  // Check if onboarding was completed
  const initialShowOnboarding =
    safeLocalStorage('get', 'onboardingComplete') !== 'true';

  const { state, dispatch, ...actions } = useAppReducer(initialShowOnboarding);

  return (
    <AppContext.Provider value={{ state, ...actions }}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Custom hook to access the App Context
 * @throws Error if used outside of AppProvider
 */
export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

/**
 * Selector hook for optimized re-renders
 * Only re-renders when the selected state changes
 */
export function useAppSelector<T>(selector: (state: AppState) => T): T {
  const { state } = useAppContext();
  return selector(state);
}

/**
 * Hook to get only the actions (no state)
 * Useful for event handlers that don't need to read state
 */
export function useAppActions() {
  const { state: _state, ...actions } = useAppContext();
  return actions;
}

export default AppContext;
