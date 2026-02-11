/**
 * Central Navigation Configuration
 *
 * Single source of truth for all navigation items, sections, and groupings.
 * Used by Sidebar, MobileSidebarDrawer, MobileBottomBar, and CommandPalette.
 *
 * Navigation Reorganisation 2026:
 * 3 Sektionen (Denken, Entdecken, Wachsen) + Chat + Footer
 * Aufgabenorientiert statt technisch gruppiert.
 */

import type { Page } from './types';

export interface NavItem {
  page: Page;
  icon: string;
  label: string;
  description?: string;
  /** Badge type - resolved to actual count at render time */
  badge?: 'archived' | 'notifications';
  /** Sub-pages that should highlight this item */
  subPages?: Page[];
}

export interface NavSection {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

/**
 * Chat item - displayed prominently before sections
 */
export const NAV_CHAT_ITEM: NavItem = {
  page: 'chat',
  icon: '💬',
  label: 'Chat',
  description: 'Direkte KI-Konversation',
};

/**
 * Main navigation sections displayed in sidebar
 *
 * 3 aufgabenorientierte Sektionen:
 * - Denken: Gedanken erfassen & entwickeln, KI-Werkstatt
 * - Entdecken: Insights, Wissensbasis, Business
 * - Wachsen: Lernen, Meine KI personalisieren
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'denken',
    label: 'Denken',
    icon: '🧠',
    items: [
      {
        page: 'ideas',
        icon: '💡',
        label: 'Gedanken',
        description: 'Ideen erfassen, entwickeln und ordnen',
        subPages: ['incubator', 'archive', 'triage'],
      },
      {
        page: 'workshop',
        icon: '🧪',
        label: 'Werkstatt',
        description: 'KI-Vorschlaege und Agenten',
        subPages: ['proactive', 'evolution', 'agent-teams'],
      },
    ],
  },
  {
    id: 'entdecken',
    label: 'Entdecken',
    icon: '📊',
    items: [
      {
        page: 'insights',
        icon: '📊',
        label: 'Insights',
        description: 'Statistiken, Trends und Verbindungen',
        subPages: ['analytics', 'digest', 'knowledge-graph'],
      },
      {
        page: 'documents',
        icon: '📚',
        label: 'Wissensbasis',
        description: 'Dokumente, Editor, Medien und Meetings',
        subPages: ['canvas', 'media', 'meetings'],
      },
      {
        page: 'business',
        icon: '💼',
        label: 'Business',
        description: 'Umsatz, Traffic, SEO und Berichte',
      },
    ],
  },
  {
    id: 'wachsen',
    label: 'Wachsen',
    icon: '🌱',
    items: [
      {
        page: 'learning',
        icon: '📖',
        label: 'Lernen',
        description: 'Lernziele und Fortschritt',
        subPages: ['learning-tasks'],
      },
      {
        page: 'my-ai',
        icon: '🤖',
        label: 'Meine KI',
        description: 'Personalisierung, KI-Wissen und Sprach-Chat',
        subPages: ['voice-chat'],
      },
    ],
  },
];

/**
 * Footer items - always visible at sidebar bottom
 */
export const NAV_FOOTER_ITEMS: NavItem[] = [
  {
    page: 'settings',
    icon: '⚙️',
    label: 'Einstellungen',
    description: 'Profil, Automationen, Integrationen und mehr',
    subPages: ['profile', 'automations', 'integrations', 'export', 'sync'],
  },
  {
    page: 'notifications',
    icon: '🔔',
    label: 'Benachrichtigungen',
    description: 'Benachrichtigungen',
    badge: 'notifications',
  },
];

/**
 * Check if a page is active (including sub-pages)
 */
export function isNavItemActive(item: NavItem, currentPage: Page): boolean {
  if (currentPage === item.page) return true;
  return item.subPages?.includes(currentPage) ?? false;
}

/**
 * Find the section that contains a given page
 */
export function findSectionForPage(page: Page): NavSection | undefined {
  return NAV_SECTIONS.find(section =>
    section.items.some(item => item.page === page || item.subPages?.includes(page))
  );
}

/**
 * Get page label for display (e.g. in TopBar)
 */
export function getPageLabel(page: Page): string {
  if (page === 'home') return 'Dashboard';
  if (page === 'chat') return NAV_CHAT_ITEM.label;

  for (const section of NAV_SECTIONS) {
    const item = section.items.find(i => i.page === page || i.subPages?.includes(page));
    if (item) return item.label;
  }

  const footerItem = NAV_FOOTER_ITEMS.find(i => i.page === page || i.subPages?.includes(page));
  if (footerItem) return footerItem.label;

  return 'ZenAI';
}

/**
 * Find NavItem by page identifier (searches chat, sections + footer)
 */
export function getNavItemByPage(page: Page): NavItem | undefined {
  if (page === 'home') return { page: 'home', icon: '🏠', label: 'Dashboard' };
  if (page === 'chat') return NAV_CHAT_ITEM;

  for (const section of NAV_SECTIONS) {
    const item = section.items.find(i => i.page === page || i.subPages?.includes(page));
    if (item) return item;
  }

  return NAV_FOOTER_ITEMS.find(i => i.page === page || i.subPages?.includes(page));
}
