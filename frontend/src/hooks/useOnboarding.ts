/**
 * useOnboarding Hook
 *
 * Manages first-run onboarding state via localStorage.
 * Returns whether to show the wizard, and functions to complete/reset it.
 */

import { useState, useCallback } from 'react';
import { safeLocalStorage } from '../utils/storage';

const STORAGE_KEY = 'zenai_onboarding_completed';

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return safeLocalStorage('get', STORAGE_KEY) !== 'true';
  });

  const completeOnboarding = useCallback(() => {
    safeLocalStorage('set', STORAGE_KEY, 'true');
    setShowOnboarding(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    safeLocalStorage('remove', STORAGE_KEY);
    setShowOnboarding(true);
  }, []);

  return { showOnboarding, completeOnboarding, resetOnboarding };
}
