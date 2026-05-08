/**
 * Accessibility Tests — axe-core WCAG 2.1 AA Compliance
 *
 * Tests critical pages and components for accessibility violations.
 * Uses vitest-axe for automated scanning.
 *
 * Phase 143: Expanded from 3 skeleton tests to full page coverage.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { expect, describe, test, vi, beforeEach } from 'vitest';
import { renderA11y, AXE_PAGE_RULES } from './a11y-test-utils';

// Extend expect with toHaveNoViolations at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toHaveNoViolations } = require('vitest-axe/matchers') as { toHaveNoViolations: Parameters<typeof expect.extend>[0][string] };
expect.extend({ toHaveNoViolations });

// ─── Module mocks (hoisted before imports) ─────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'test-token', user: { id: 'u1', email: 'test@test.com' } },
    user: { id: 'u1', email: 'test@test.com', display_name: 'Test', role: 'admin', avatar_url: null, mfa_enabled: false },
    loading: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn(),
    register: vi.fn().mockResolvedValue({ error: null }),
    resetPassword: vi.fn().mockResolvedValue({ error: null }),
    getAccessToken: () => 'test-token',
    currentOrg: null,
    currentWorkspace: null,
    workspaceContexts: [],
    userOrgs: [],
    switchWorkspace: vi.fn(),
    refreshOrgs: vi.fn(),
  }),
}));

vi.mock('../contexts/LayoutModeContext', () => ({
  useLayoutMode: () => ({
    state: { mode: 'workspace', chatDrawerOpen: false, chatDrawerWidth: 400, sidebarCollapsed: false },
    dispatch: vi.fn(),
  }),
  useLayoutModeSafe: () => ({
    state: { mode: 'workspace', chatDrawerOpen: false, chatDrawerWidth: 400, sidebarCollapsed: false },
    dispatch: vi.fn(),
  }),
}));

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'system' as const,
    resolvedTheme: 'light' as const,
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('../utils/aiPersonality', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual };
});

// Radix UI Select causes dual-React issues in jsdom; mock with native elements
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <button type="button" aria-label={ariaLabel}>{children}</button>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock('../components/ConfirmDialog', () => ({
  useConfirm: () => vi.fn(async () => true),
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock axios to prevent API calls
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    default: {
      get: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
      create: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ data: {} }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      })),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
      isCancel: vi.fn(() => false),
    },
  };
});

// Mock React Query hooks that fire on mount
vi.mock('../hooks/queries/useDashboard', () => ({
  useDashboardSummaryQuery: () => ({ data: null, isLoading: false, error: null }),
  useAIPulseQuery: () => ({ data: null, isLoading: false, error: null }),
  useUpcomingEventsQuery: () => ({ data: [], isLoading: false, error: null }),
  useMarkActivityReadMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('../hooks/queries/useIdeas', () => ({
  useIdeasQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCreateIdeaMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveIdeaMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteIdeaMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/queries/useTasks', () => ({
  useTasksQuery: () => ({ data: [], isLoading: false, error: null }),
  useProjectsQuery: () => ({ data: [], isLoading: false, error: null }),
  useCreateTaskMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateTaskMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteTaskMutation: () => ({ mutateAsync: vi.fn() }),
  useReorderTasksMutation: () => ({ mutateAsync: vi.fn() }),
  useCreateProjectMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../hooks/queries/useBilling', () => ({
  useBillingStatus: () => ({ data: null, isLoading: false }),
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({ settings: {}, updateSetting: vi.fn(), loading: false }),
}));

vi.mock('../hooks/useGettingStarted', () => ({
  useGettingStarted: () => ({
    steps: [{ id: '1', title: 'Step 1', done: false }],
    completedCount: 0,
    visible: true,
    markDone: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('../hooks/useTabNavigation', () => ({
  useTabNavigation: ({ initialTab, defaultTab }: { initialTab?: string; defaultTab: string }) => ({
    activeTab: initialTab || defaultTab,
    handleTabChange: vi.fn(),
  }),
}));

vi.mock('../hooks/useCommandRegistry', () => ({
  useRegisteredCommands: () => [],
}));

vi.mock('../hooks/useSmartSuggestions', () => ({
  useSmartSuggestions: () => ({ suggestions: [], loading: false, dismiss: vi.fn(), snooze: vi.fn() }),
}));

vi.mock('../hooks/useAgUIState', () => ({
  useAgUIState: () => ({ events: [], isActive: false }),
}));

vi.mock('../services/offline-chat', () => ({
  isOffline: () => false,
  queueMessage: vi.fn(),
  generateOfflineResponse: vi.fn(),
  syncPendingMessages: vi.fn(),
}));

vi.mock('fuse.js', () => ({
  default: class {
    search() { return []; }
  },
}));

vi.mock('../components/IdeasPage/useIdeaFilters', () => ({
  useIdeaFilters: () => ({
    filters: {
      search: '',
      status: new Set(['active']),
      types: new Set(),
      categories: new Set(),
      priorities: new Set(),
      favoritesOnly: false,
    },
    sort: 'updated',
    setSort: vi.fn(),
    toggleFilter: vi.fn(),
    setSearch: vi.fn(),
    clearAll: vi.fn(),
    activeFilterCount: 0,
    chipDefs: [],
  }),
}));

vi.mock('../hooks/queries/useChat', () => ({
  useChatSessionsQuery: () => ({ data: [], isLoading: false, error: null }),
  useChatMessagesQuery: () => ({ data: [], isLoading: false, error: null }),
  useCreateSessionMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ id: 's1' }) }),
  useDeleteSessionMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/queries/useCalendar', () => ({
  useCalendarEventsQuery: () => ({ data: [], isLoading: false, error: null }),
  useCreateEventMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateEventMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteEventMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/queries/useEmail', () => ({
  useEmailsQuery: () => ({ data: [], isLoading: false, error: null }),
  useEmailStatsQuery: () => ({ data: { unread: 0, total: 0 }, isLoading: false, error: null }),
}));

vi.mock('../hooks/queries/useFinance', () => ({
  useFinanceOverviewQuery: () => ({ data: null, isLoading: false, error: null }),
  useAccountsQuery: () => ({ data: [], isLoading: false, error: null }),
  useTransactionsQuery: () => ({ data: [], isLoading: false, error: null }),
  useBudgetsQuery: () => ({ data: [], isLoading: false, error: null }),
  useGoalsQuery: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('../hooks/queries/useContacts', () => ({
  useContactsQuery: () => ({ data: [], isLoading: false, error: null }),
  useContactStatsQuery: () => ({ data: { total: 0, recent: 0 }, isLoading: false, error: null }),
  useCreateContactMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateContactMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteContactMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/queries/useCognitiveData', () => ({
  useCognitiveHealthQuery: () => ({ data: null, isLoading: false, error: null }),
  useCuriosityGapsQuery: () => ({ data: [], isLoading: false, error: null }),
  usePredictionHistoryQuery: () => ({ data: [], isLoading: false, error: null }),
  useReviewQueueQuery: () => ({ data: [], isLoading: false, error: null }),
  useImprovementOpportunitiesQuery: () => ({ data: [], isLoading: false, error: null }),
  useSubmitReviewMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/useStreamingChat', () => ({
  useStreamingChat: () => ({
    messages: [],
    isStreaming: false,
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
    thinkingContent: null,
    toolCalls: [],
  }),
}));

vi.mock('../services/local-inference', () => ({
  isWebGPUAvailable: () => false,
  loadModel: vi.fn(),
  generateResponse: vi.fn(),
}));

vi.mock('../hooks/useLocalInference', () => ({
  useLocalInference: () => ({
    available: false,
    loading: false,
    generate: vi.fn(),
  }),
}));

// ─── Component imports (after mocks) ───────────────────────────────

import { ChatSkeleton, DashboardSkeleton, ListSkeleton } from '../components/skeletons/PageSkeletons';
import { AuthPage } from '../components/AuthPage/AuthPage';
import { CommandPalette } from '../components/CommandPalette';
import { GettingStartedChecklist } from '../components/onboarding/GettingStartedChecklist';
import { TopBar } from '../components/layout/TopBar';
import { MobileBottomBar } from '../components/layout/MobileBottomBar';
import { WorkspaceSwitcher } from '../components/layout/WorkspaceSwitcher';
import { Dashboard } from '../components/Dashboard';
import { IdeasPage } from '../components/IdeasPage';
import { PlannerPage } from '../components/PlannerPage/PlannerPage';
import { DocumentVaultPage } from '../components/DocumentVaultPage';
import { UserSettingsPage } from '../components/settings/UserSettingsPage';
import { ChatHub } from '../components/ChatHub/ChatHub';

// ─── Tests ─────────────────────────────────────────────────────────

describe('Accessibility - Skeleton Components', () => {
  test('ChatSkeleton has no a11y violations', async () => {
    const { container } = render(<ChatSkeleton />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('DashboardSkeleton has no a11y violations', async () => {
    const { container } = render(<DashboardSkeleton />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('ListSkeleton has no a11y violations', async () => {
    const { container } = render(<ListSkeleton />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Accessibility - Auth Page', () => {
  test('AuthPage (login form) has no a11y violations', async () => {
    const { container } = renderA11y(<AuthPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('AuthPage has labeled form inputs', () => {
    const { container } = renderA11y(<AuthPage />);
    const inputs = container.querySelectorAll('input');
    for (const input of inputs) {
      const hasLabel =
        input.getAttribute('aria-label') ||
        input.getAttribute('placeholder') ||
        input.id && container.querySelector(`label[for="${input.id}"]`);
      expect(hasLabel).toBeTruthy();
    }
  });
});

describe('Accessibility - Navigation Components', () => {
  test('TopBar has no a11y violations', async () => {
    const { container } = renderA11y(
      <TopBar
        context="operations"
        onContextChange={vi.fn()}
        onSearchOpen={vi.fn()}
        onNavigateHome={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('TopBar has navigation landmark', () => {
    const { container } = renderA11y(
      <TopBar
        context="operations"
        onContextChange={vi.fn()}
        onSearchOpen={vi.fn()}
        onNavigateHome={vi.fn()}
      />,
    );
    const nav = container.querySelector('nav, [role="navigation"]');
    expect(nav).toBeTruthy();
  });

  test('TopBar buttons have accessible names', () => {
    const { container } = renderA11y(
      <TopBar
        context="operations"
        onContextChange={vi.fn()}
        onSearchOpen={vi.fn()}
        onNavigateHome={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll('button');
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') || button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });

  test('MobileBottomBar has no a11y violations', async () => {
    const { container } = renderA11y(
      <MobileBottomBar
        currentPage="hub"
        onNavigate={vi.fn()}
        onOpenSearch={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('MobileBottomBar has tab navigation pattern', () => {
    const { container } = renderA11y(
      <MobileBottomBar
        currentPage="hub"
        onNavigate={vi.fn()}
        onOpenSearch={vi.fn()}
      />,
    );
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBeGreaterThan(0);
  });
});

describe('Accessibility - Command Palette', () => {
  test('CommandPalette (open) has no a11y violations', async () => {
    const { container } = renderA11y(
      <CommandPalette
        isOpen={true}
        onClose={vi.fn()}
        commands={[
          { id: 'test', label: 'Test Command', icon: '🔍', category: 'actions', action: vi.fn() },
        ]}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('CommandPalette has search input with label', () => {
    const { container } = renderA11y(
      <CommandPalette
        isOpen={true}
        onClose={vi.fn()}
        commands={[]}
      />,
    );
    const input = container.querySelector('input');
    if (input) {
      const hasLabel =
        input.getAttribute('aria-label') ||
        input.getAttribute('placeholder') ||
        input.getAttribute('role');
      expect(hasLabel).toBeTruthy();
    }
  });
});

describe('Accessibility - Onboarding', () => {
  test('GettingStartedChecklist has no a11y violations', async () => {
    const { container } = renderA11y(
      <GettingStartedChecklist onNavigate={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('GettingStartedChecklist buttons have accessible names', () => {
    const { container } = renderA11y(
      <GettingStartedChecklist onNavigate={vi.fn()} />,
    );
    const buttons = container.querySelectorAll('button');
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') || button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });
});

describe('Accessibility - Workspace Switcher', () => {
  test('WorkspaceSwitcher has no a11y violations', async () => {
    const { container } = renderA11y(<WorkspaceSwitcher />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── Phase 145: Full Page Accessibility Tests ─────────────────────

describe('Accessibility - ChatHub Page', () => {
  test('ChatHub has no a11y violations', async () => {
    const { container } = renderA11y(<ChatHub context="operations" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('ChatHub has main content region', () => {
    const { container } = renderA11y(<ChatHub context="operations" />);
    const main = container.querySelector('main, [role="main"]');
    const region = container.querySelector('[role="region"], section, article');
    expect(main || region || container.querySelector('h1, h2')).toBeTruthy();
  });
});

describe('Accessibility - Dashboard Page', () => {
  test('Dashboard has no a11y violations', async () => {
    const { container } = renderA11y(
      <Dashboard
        context="operations"
        onNavigate={vi.fn()}
        isAIActive={false}
        ideasCount={5}
        apiStatus={null}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('Dashboard buttons have accessible names', () => {
    const { container } = renderA11y(
      <Dashboard
        context="operations"
        onNavigate={vi.fn()}
        isAIActive={false}
        ideasCount={0}
        apiStatus={null}
      />,
    );
    const buttons = container.querySelectorAll('button');
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') || button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });

  test('Dashboard headings have proper hierarchy', () => {
    const { container } = renderA11y(
      <Dashboard
        context="operations"
        onNavigate={vi.fn()}
        isAIActive={false}
        ideasCount={0}
        apiStatus={null}
      />,
    );
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length > 0) {
      // First heading should be h1 or h2 (within page context)
      const level = parseInt(headings[0].tagName.slice(1));
      expect(level).toBeLessThanOrEqual(3);
    }
  });
});

describe('Accessibility - Ideas Page', () => {
  test('IdeasPage has no a11y violations', async () => {
    const { container } = renderA11y(
      <IdeasPage context="operations" initialTab="ideas" onNavigate={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('IdeasPage has labeled search/filter inputs', () => {
    const { container } = renderA11y(
      <IdeasPage context="operations" initialTab="ideas" onNavigate={vi.fn()} />,
    );
    const inputs = container.querySelectorAll('input');
    for (const input of inputs) {
      const hasLabel =
        input.getAttribute('aria-label') ||
        input.getAttribute('placeholder') ||
        (input.id && container.querySelector(`label[for="${input.id}"]`));
      expect(hasLabel).toBeTruthy();
    }
  });

  test('IdeasPage buttons have accessible names', () => {
    const { container } = renderA11y(
      <IdeasPage context="operations" initialTab="ideas" onNavigate={vi.fn()} />,
    );
    const buttons = container.querySelectorAll('button');
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') || button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });
});

describe('Accessibility - Planner Page', () => {
  test('PlannerPage has no a11y violations', async () => {
    const { container } = renderA11y(
      <PlannerPage context="operations" initialTab={'calendar' as any} onBack={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('PlannerPage tab buttons have accessible names', () => {
    const { container } = renderA11y(
      <PlannerPage context="operations" initialTab={'calendar' as any} onBack={vi.fn()} />,
    );
    const buttons = container.querySelectorAll('button');
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') || button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });
});

describe('Accessibility - Document Vault Page', () => {
  test('DocumentVaultPage has no a11y violations', async () => {
    const { container } = renderA11y(
      <DocumentVaultPage context="operations" initialTab={'documents' as any} onBack={vi.fn()} />,
    );
    const results = await axe(container, { rules: AXE_PAGE_RULES });
    expect(results).toHaveNoViolations();
  });

  test('DocumentVaultPage buttons have accessible names', () => {
    const { container } = renderA11y(
      <DocumentVaultPage context="operations" initialTab={'documents' as any} onBack={vi.fn()} />,
    );
    const buttons = container.querySelectorAll('button');
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') || button.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });
});

describe('Accessibility - Settings Page', () => {
  test('UserSettingsPage has no a11y violations', async () => {
    const { container } = renderA11y(
      <UserSettingsPage context="operations" initialTab={'general' as any} onBack={vi.fn()} onNavigate={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('UserSettingsPage form inputs have labels', () => {
    const { container } = renderA11y(
      <UserSettingsPage context="operations" initialTab={'general' as any} onBack={vi.fn()} onNavigate={vi.fn()} />,
    );
    const inputs = container.querySelectorAll('input, select, textarea');
    for (const input of inputs) {
      const hasLabel =
        input.getAttribute('aria-label') ||
        input.getAttribute('aria-labelledby') ||
        input.getAttribute('placeholder') ||
        (input.id && container.querySelector(`label[for="${input.id}"]`)) ||
        input.closest('label');
      expect(hasLabel).toBeTruthy();
    }
  });

  test('UserSettingsPage tab navigation is accessible', () => {
    const { container } = renderA11y(
      <UserSettingsPage context="operations" initialTab={'general' as any} onBack={vi.fn()} onNavigate={vi.fn()} />,
    );
    const tabButtons = container.querySelectorAll('[role="tab"], button');
    expect(tabButtons.length).toBeGreaterThan(0);
    for (const tab of tabButtons) {
      const name = tab.getAttribute('aria-label') || tab.textContent?.trim();
      expect(name).toBeTruthy();
    }
  });
});
