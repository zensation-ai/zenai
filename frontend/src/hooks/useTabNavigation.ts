/**
 * useTabNavigation - Shared hook for tab-based hub pages
 *
 * Eliminates duplicate tab state + URL sync logic across
 * AIWorkshop, InsightsDashboard, BusinessDashboard, MyAIPage,
 * SettingsDashboard, and DocumentVaultPage.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseTabNavigationOptions<T extends string> {
  /** Tab from URL (passed as initialTab prop) */
  initialTab: T | undefined;
  /** All valid tab identifiers */
  validTabs: readonly T[];
  /** Fallback when initialTab is invalid or undefined */
  defaultTab: T;
  /** Base URL path (e.g. '/workshop', '/settings') */
  basePath: string;
  /** If set, this tab navigates to basePath without suffix (e.g. '/settings' instead of '/settings/general') */
  rootTab?: T;
}

interface UseTabNavigationResult<T extends string> {
  activeTab: T;
  handleTabChange: (tab: T) => void;
}

export function useTabNavigation<T extends string>({
  initialTab,
  validTabs,
  defaultTab,
  basePath,
  rootTab,
}: UseTabNavigationOptions<T>): UseTabNavigationResult<T> {
  const navigate = useNavigate();

  const validate = (tab: T | undefined): T =>
    tab && validTabs.includes(tab) ? tab : defaultTab;

  const [activeTab, setActiveTab] = useState<T>(() => validate(initialTab));

  useEffect(() => {
    setActiveTab(validate(initialTab));
  }, [initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = useCallback((tab: T) => {
    setActiveTab(tab);
    if (rootTab && tab === rootTab) {
      navigate(basePath, { replace: true });
    } else {
      navigate(`${basePath}/${tab}`, { replace: true });
    }
  }, [navigate, basePath, rootTab]);

  return { activeTab, handleTabChange };
}
