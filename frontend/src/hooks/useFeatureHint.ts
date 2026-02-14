/**
 * useFeatureHint Hook
 *
 * Shows contextual feature hints on first visit to each page.
 * Only active after onboarding is complete.
 * Persists dismissals in localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { FEATURE_HINTS, STORAGE_KEY_PREFIX } from '../constants/featureHints';
import type { FeatureHint } from '../constants/featureHints';

const ONBOARDING_KEY = 'onboardingComplete';
const HINT_DELAY_MS = 2000;

function isHintSeen(hintId: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${hintId}`) === 'true';
  } catch {
    return false;
  }
}

function markHintSeen(hintId: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${hintId}`, 'true');
  } catch {
    // localStorage unavailable
  }
}

function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return true; // If can't read, assume complete
  }
}

export function useFeatureHint(currentPath: string) {
  const [activeHint, setActiveHint] = useState<FeatureHint | null>(null);

  useEffect(() => {
    // Don't show during onboarding
    if (!isOnboardingComplete()) {
      setActiveHint(null);
      return;
    }

    // Find matching hint for current path
    const matchingHint = FEATURE_HINTS.find(
      hint => currentPath === hint.pathPrefix || currentPath.startsWith(hint.pathPrefix + '/')
    );

    if (!matchingHint || isHintSeen(matchingHint.id)) {
      setActiveHint(null);
      return;
    }

    // Show hint after delay for better UX
    const timer = setTimeout(() => {
      setActiveHint(matchingHint);
    }, HINT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [currentPath]);

  const dismissHint = useCallback((hintId: string) => {
    markHintSeen(hintId);
    setActiveHint(null);
  }, []);

  const resetAllHints = useCallback(() => {
    FEATURE_HINTS.forEach(hint => {
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${hint.id}`);
      } catch {
        // localStorage unavailable
      }
    });
    setActiveHint(null);
  }, []);

  return { activeHint, dismissHint, resetAllHints };
}
