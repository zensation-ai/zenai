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
  },
  {
    page: 'calendar',
    icon: 'Calendar',
    label: 'Planer',
    description: 'Kalender, Aufgaben, Kontakte & Projekte',
    subPages: ['tasks', 'kanban', 'gantt', 'meetings', 'contacts', 'learning-tasks'],
  },
  {
    page: 'email',
    icon: 'Mail',
    label: 'Inbox',
    description: 'E-Mails, Benachrichtigungen & KI-Hinweise',
    badge: 'email_unread',
    subPages: ['notifications'],
  },
  {
    page: 'documents',
    icon: 'FileText',
    label: 'Wissen',
    description: 'Dokumente, Canvas, Knowledge Graph & Lernen',
    subPages: ['canvas', 'media', 'knowledge-graph', 'learning', 'stories'],
  },
  {
    page: 'business',
    icon: 'BarChart3',
    label: 'Cockpit',
    description: 'Business, Finanzen & Trends',
    subPages: ['finance', 'insights', 'analytics', 'digest', 'graphrag'],
  },
  {
    page: 'my-ai',
    icon: 'Brain',
    label: 'Meine KI',
    description: 'Persona, Gedaechtnis & Sprach-Chat',
    subPages: ['voice-chat', 'memory-insights', 'digital-twin', 'procedural-memory', 'personalization'],
  },
  {
    page: 'settings',
    icon: 'Settings',
    label: 'System',
    description: 'Einstellungen, Admin & Integrationen',
    subPages: ['profile', 'automations', 'integrations', 'mcp-servers', 'export', 'sync', 'system-admin'],
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
 * For hub/home/chat/dashboard/browser/screen-memory/agent-teams → returns NAV_HUB_ITEM.
 */
export function findNavItemForPage(page: Page): NavItem | undefined {
  const hubPages: Page[] = ['hub', 'home', 'chat', 'dashboard', 'browser', 'screen-memory', 'agent-teams'];
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
