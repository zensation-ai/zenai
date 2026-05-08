/**
 * Central Navigation Configuration — Phase 105 (Zenith)
 *
 * 7+1 flat structure: Chat Hub + 7 Smart Page slots.
 * Each nav item points to an EXISTING page as intermediary.
 * Smart Pages (Phases 106-110) will replace intermediaries.
 *
 * Used by Sidebar, MobileSidebarDrawer, MobileBottomBar, TopBar, and CommandPalette.
 */

import type { Page } from './types';

export interface NavItem {
  page: Page;
  /** Lucide icon name (e.g. 'MessageSquare', 'Lightbulb') */
  icon: string;
  label: string;
  description?: string;
  /** Badge type - resolved to actual count at render time */
  badge?: 'notifications' | 'email_unread';
  /** Sub-pages that should highlight this nav item as active */
  subPages?: Page[];
  /** Lazy-import function for hover-based prefetching */
  preloadFn?: () => Promise<unknown>;
}

/**
 * Chat Hub — start page, displayed prominently above nav items
 */
export const NAV_HUB_ITEM: NavItem = {
  page: 'hub',
  icon: 'MessageSquare',
  label: 'Chat Hub',
  description: 'Frag mich alles oder gib mir eine Aufgabe',
};

/**
 * 7 Smart Page nav items — flat list, no sections.
 * Each `page` value is an existing Page type that renders the current
 * intermediary component until its Smart Page is built (Phases 106-110).
 *
 * subPages are derived from the Complete Page Type Migration Map (spec Section 3).
 */
export const NAV_ITEMS: NavItem[] = [
  {
    page: 'ideas',
    icon: 'Lightbulb',
    label: 'Ideen',
    description: 'Ideen sammeln, entwickeln & priorisieren',
    subPages: ['incubator', 'archive', 'triage', 'workshop', 'proactive', 'evolution', 'agent-teams', 'ai-workshop'],
    preloadFn: () => import('./components/IdeasPage'),
  },
  {
    page: 'calendar',
    icon: 'Calendar',
    label: 'Planer',
    description: 'Kalender, Aufgaben, Kontakte & Projekte',
    subPages: ['tasks', 'kanban', 'gantt', 'meetings', 'contacts', 'learning-tasks'],
    preloadFn: () => import('./components/PlannerPage/PlannerPage'),
  },
  {
    page: 'email',
    icon: 'Mail',
    label: 'Inbox',
    description: 'E-Mails, Benachrichtigungen & KI-Hinweise',
    badge: 'email_unread',
    subPages: ['notifications'],
    preloadFn: () => import('./components/EmailPage/InboxSmartPage'),
  },
  {
    page: 'documents',
    icon: 'FileText',
    label: 'Wissensbasis',
    description: 'Dokumente, Canvas & Medien',
    subPages: ['canvas', 'media', 'knowledge-graph', 'learning'],
    preloadFn: () => import('./components/DocumentVaultPage'),
  },
  {
    page: 'business',
    icon: 'BarChart3',
    label: 'Cockpit',
    description: 'Business, Finanzen & Trends',
    subPages: ['finance', 'insights', 'analytics', 'digest', 'graphrag', 'social'],
    preloadFn: () => import('./components/BusinessDashboard'),
  },
  {
    page: 'my-ai',
    icon: 'Brain',
    label: 'Meine KI',
    description: 'Persona, Gedächtnis & Sprach-Chat',
    subPages: ['voice-chat', 'memory-insights', 'digital-twin', 'procedural-memory'],
    preloadFn: () => import('./components/MyAIPage'),
  },
  {
    page: 'settings-user',
    icon: 'Settings',
    label: 'System',
    description: 'Einstellungen, Admin & Integrationen',
    subPages: ['settings-ai', 'settings-integrations', 'settings-admin', 'profile', 'automations', 'integrations', 'mcp-servers', 'export', 'sync', 'system-admin', 'billing'] as Page[],
    preloadFn: () => import('./components/settings/UserSettingsPage'),
  },
];

// ===========================================
// Derived data for consumers
// ===========================================

/** All navigable items: Hub + 7 Smart Pages */
export const ALL_NAVIGABLE_ITEMS: NavItem[] = [NAV_HUB_ITEM, ...NAV_ITEMS];

/**
 * Check if a page is active (including sub-pages)
 */
export function isNavItemActive(item: NavItem, currentPage: Page): boolean {
  if (currentPage === item.page) return true;
  return item.subPages?.includes(currentPage) ?? false;
}

/**
 * Find the nav item that contains a given page (as primary or subPage).
 * For hub/home/chat/browser/screen-memory/agent-teams → returns NAV_HUB_ITEM.
 */
export function findNavItemForPage(page: Page): NavItem | undefined {
  const hubPages: Page[] = ['hub', 'home', 'chat', 'browser', 'screen-memory', 'agent-teams'];
  if (hubPages.includes(page)) return NAV_HUB_ITEM;
  return NAV_ITEMS.find(item => item.page === page || item.subPages?.includes(page));
}

/**
 * Get page label for display (e.g. in TopBar)
 */
export function getPageLabel(page: Page): string {
  const item = findNavItemForPage(page);
  return item?.label ?? 'ZenAI';
}

/**
 * Find NavItem by page identifier (searches hub + all items + subPages)
 */
export function getNavItemByPage(page: Page): NavItem | undefined {
  return findNavItemForPage(page);
}

/**
 * Get page description for display (e.g. in TopBar subtitle)
 */
export function getPageDescription(page: Page): string | undefined {
  const item = findNavItemForPage(page);
  return item?.description;
}

// ===========================================
// Workspace Sidebar Groups (Dual-Mode Layout)
// ===========================================

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Additional nav items for Workspace mode that aren't in the 7+1 Smart Page list.
 * These pages exist as sub-pages in the Smart Page model but get promoted
 * to top-level items in the grouped Workspace sidebar.
 */
const NAV_WORKSPACE_ITEMS: Record<string, NavItem> = {
  contacts: { page: 'contacts' as Page, icon: 'Users', label: 'Kontakte' },
  finance: { page: 'finance' as Page, icon: 'Wallet', label: 'Finanzen' },
  insights: { page: 'insights' as Page, icon: 'TrendingUp', label: 'Einblicke' },
  learning: { page: 'learning' as Page, icon: 'GraduationCap', label: 'Lernen' },
  workshop: {
    page: 'workshop' as Page,
    icon: 'Wrench',
    label: 'Werkstatt',
    subPages: ['proactive', 'evolution', 'agent-teams'] as Page[],
  },
  settingsAi: { page: 'settings-ai' as Page, icon: 'Cpu', label: 'KI-Einstellungen' },
  settingsIntegrations: { page: 'settings-integrations' as Page, icon: 'Plug', label: 'Integrationen' },
  settingsAdmin: { page: 'settings-admin' as Page, icon: 'Shield', label: 'Administration' },
};

/**
 * Grouped sidebar items for Workspace mode.
 * Each group has a label and a list of NavItems.
 * References existing NAV_ITEMS where possible, adds workspace-specific items.
 */
export const SIDEBAR_GROUPS: NavGroup[] = [
  {
    id: 'work',
    label: 'Arbeiten',
    items: [
      NAV_ITEMS.find(i => i.page === 'ideas')!,
      NAV_ITEMS.find(i => i.page === 'calendar')!,
      NAV_ITEMS.find(i => i.page === 'email')!,
      NAV_WORKSPACE_ITEMS.contacts,
    ],
  },
  {
    id: 'knowledge',
    label: 'Wissen',
    items: [
      NAV_ITEMS.find(i => i.page === 'documents')!,
      NAV_WORKSPACE_ITEMS.learning,
    ],
  },
  {
    id: 'control',
    label: 'Steuern',
    items: [
      NAV_ITEMS.find(i => i.page === 'business')!,
      NAV_WORKSPACE_ITEMS.finance,
      NAV_WORKSPACE_ITEMS.insights,
    ],
  },
  {
    id: 'ai',
    label: 'KI',
    items: [
      NAV_ITEMS.find(i => i.page === 'my-ai')!,
      NAV_WORKSPACE_ITEMS.workshop,
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      NAV_ITEMS.find(i => i.page === 'settings-user')!,
      NAV_WORKSPACE_ITEMS.settingsAi,
      NAV_WORKSPACE_ITEMS.settingsIntegrations,
      NAV_WORKSPACE_ITEMS.settingsAdmin,
    ],
  },
];
