/**
 * Central Navigation Configuration
 *
 * Single source of truth for all navigation items, sections, and groupings.
 * Used by Sidebar, MobileSidebarDrawer, MobileBottomBar, and CommandPalette.
 *
 * Navigation Reorganisation 2026:
 * 4 Sektionen (Ideen, Organisieren, Auswerten, KI & Lernen) + Chat + Footer
 * Funktional gruppiert statt abstrakt.
 */

import type { Page } from './types';

export interface NavItem {
  page: Page;
  icon: string;
  label: string;
  description?: string;
  /** Badge type - resolved to actual count at render time */
  badge?: 'archived' | 'notifications' | 'email_unread';
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
  description: 'Direkt mit der KI sprechen',
};

/**
 * Browser item - displayed after chat, before sections
 */
export const NAV_BROWSER_ITEM: NavItem = {
  page: 'browser',
  icon: '🌐',
  label: 'Browser',
  description: 'Webseiten durchsuchen & speichern',
};

/**
 * Main navigation sections displayed in sidebar
 *
 * 4 funktionale Sektionen:
 * - Ideen: Gedanken erfassen & entwickeln, KI-Werkstatt
 * - Organisieren: Planer, Wissensbasis
 * - Auswerten: Insights, Business
 * - KI & Lernen: Meine KI personalisieren, Lernen
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'ideen',
    label: 'Ideen',
    icon: '💡',
    items: [
      {
        page: 'ideas',
        icon: '💡',
        label: 'Gedanken',
        description: 'Deine Ideen sammeln & ordnen',
        subPages: ['incubator', 'archive', 'triage'],
      },
      {
        page: 'workshop',
        icon: '🧪',
        label: 'Werkstatt',
        description: 'KI entwickelt deine Ideen weiter',
        subPages: ['proactive', 'evolution', 'agent-teams'],
      },
    ],
  },
  {
    id: 'organisieren',
    label: 'Organisieren',
    icon: '📋',
    items: [
      {
        page: 'calendar',
        icon: '📋',
        label: 'Planer',
        description: 'Kalender, Aufgaben & Projekte',
        subPages: ['tasks', 'kanban', 'gantt', 'meetings'],
      },
      {
        page: 'contacts',
        icon: '👥',
        label: 'Kontakte',
        description: 'Kontakte & Organisationen verwalten',
      },
      {
        page: 'email',
        icon: '✉️',
        label: 'E-Mail',
        description: 'E-Mails senden & empfangen',
        badge: 'email_unread',
      },
      {
        page: 'documents',
        icon: '📚',
        label: 'Wissensbasis',
        description: 'Dokumente, Notizen & Medien',
        subPages: ['canvas', 'media'],
      },
    ],
  },
  {
    id: 'auswerten',
    label: 'Auswerten',
    icon: '📊',
    items: [
      {
        page: 'insights',
        icon: '📊',
        label: 'Insights',
        description: 'Muster & Trends in deinen Gedanken',
        subPages: ['analytics', 'digest', 'knowledge-graph'],
      },
      {
        page: 'finance',
        icon: '💰',
        label: 'Finanzen',
        description: 'Ausgaben, Budgets & Sparziele',
      },
      {
        page: 'business',
        icon: '💼',
        label: 'Business',
        description: 'Geschaeftszahlen & Berichte',
      },
    ],
  },
  {
    id: 'ki-lernen',
    label: 'KI & Lernen',
    icon: '🤖',
    items: [
      {
        page: 'my-ai',
        icon: '🤖',
        label: 'Meine KI',
        description: 'KI auf dich abstimmen',
        subPages: ['voice-chat'],
      },
      {
        page: 'learning',
        icon: '📖',
        label: 'Lernen',
        description: 'Lernziele setzen & verfolgen',
        subPages: ['learning-tasks'],
      },
      {
        page: 'screen-memory',
        icon: '🧠',
        label: 'Screen Memory',
        description: 'Bildschirmaktivitaet durchsuchen',
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
    description: 'Profil & App konfigurieren',
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
  if (page === 'browser') return NAV_BROWSER_ITEM.label;

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
  if (page === 'browser') return NAV_BROWSER_ITEM;

  for (const section of NAV_SECTIONS) {
    const item = section.items.find(i => i.page === page || i.subPages?.includes(page));
    if (item) return item;
  }

  return NAV_FOOTER_ITEMS.find(i => i.page === page || i.subPages?.includes(page));
}

/**
 * Get page description for display (e.g. in TopBar subtitle)
 */
export function getPageDescription(page: Page): string | undefined {
  const item = getNavItemByPage(page);
  return item?.description;
}
