/**
 * Central Navigation Configuration
 *
 * Single source of truth for all navigation items, sections, and groupings.
 * Used by Sidebar, MobileSidebarDrawer, MobileBottomBar, and CommandPalette.
 *
 * Navigation Reorganisation 2026:
 * 4 Sektionen (Ideen, Organisieren, Auswerten, KI & Lernen) + Chat + Footer
 * Funktional gruppiert statt abstrakt.
 *
 * Phase 100: Icons are now Lucide icon names (string) instead of emoji.
 * Use `getPageIcon()` from `utils/navIcons` to render the actual icon component.
 */

import type { Page } from './types';

export interface NavItem {
  page: Page;
  /** Lucide icon name (e.g. 'MessageSquare', 'Lightbulb') */
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
  /** Lucide icon name for the section header */
  icon: string;
  items: NavItem[];
}

/**
 * Chat item - displayed prominently before sections
 */
export const NAV_CHAT_ITEM: NavItem = {
  page: 'chat',
  icon: 'MessageSquare',
  label: 'Chat',
  description: 'Direkt mit der KI sprechen',
};

/**
 * Browser item - displayed after chat, before sections
 */
export const NAV_BROWSER_ITEM: NavItem = {
  page: 'browser',
  icon: 'Globe',
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
    icon: 'Lightbulb',
    items: [
      {
        page: 'ideas',
        icon: 'Lightbulb',
        label: 'Gedanken',
        description: 'Deine Ideen sammeln & ordnen',
        subPages: ['incubator', 'archive', 'triage'],
      },
      {
        page: 'workshop',
        icon: 'Wrench',
        label: 'Werkstatt',
        description: 'KI entwickelt deine Ideen weiter',
        subPages: ['proactive', 'evolution', 'agent-teams', 'automations'],
      },
    ],
  },
  {
    id: 'organisieren',
    label: 'Organisieren',
    icon: 'Calendar',
    items: [
      {
        page: 'calendar',
        icon: 'Calendar',
        label: 'Planer',
        description: 'Kalender, Aufgaben & Projekte',
        subPages: ['tasks', 'kanban', 'gantt', 'meetings'],
      },
      {
        page: 'contacts',
        icon: 'Users',
        label: 'Kontakte',
        description: 'Kontakte & Organisationen verwalten',
      },
      {
        page: 'email',
        icon: 'Mail',
        label: 'E-Mail',
        description: 'E-Mails senden & empfangen',
        badge: 'email_unread',
      },
      {
        page: 'documents',
        icon: 'FileText',
        label: 'Wissensbasis',
        description: 'Dokumente, Notizen & Medien',
        subPages: ['canvas', 'media'],
      },
    ],
  },
  {
    id: 'auswerten',
    label: 'Auswerten',
    icon: 'BarChart3',
    items: [
      {
        page: 'insights',
        icon: 'BarChart3',
        label: 'Insights',
        description: 'Muster & Trends in deinen Gedanken',
        subPages: ['analytics', 'digest', 'knowledge-graph', 'graphrag'],
      },
      {
        page: 'finance',
        icon: 'Wallet',
        label: 'Finanzen',
        description: 'Ausgaben, Budgets & Sparziele',
      },
      {
        page: 'business',
        icon: 'Briefcase',
        label: 'Business',
        description: 'Geschaeftszahlen & Berichte',
      },
    ],
  },
  {
    id: 'ki-lernen',
    label: 'KI & Lernen',
    icon: 'Brain',
    items: [
      {
        page: 'my-ai',
        icon: 'Brain',
        label: 'Meine KI',
        description: 'KI auf dich abstimmen',
        subPages: ['voice-chat', 'memory-insights', 'digital-twin', 'procedural-memory'],
      },
      {
        page: 'learning',
        icon: 'GraduationCap',
        label: 'Lernen',
        description: 'Lernziele setzen & verfolgen',
        subPages: ['learning-tasks'],
      },
      {
        page: 'screen-memory',
        icon: 'Monitor',
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
    page: 'system-admin',
    icon: 'Monitor',
    label: 'System',
    description: 'Queues, Sicherheit & Sleep Compute',
  },
  {
    page: 'settings',
    icon: 'Settings',
    label: 'Einstellungen',
    description: 'Profil & App konfigurieren',
    subPages: ['profile', 'automations', 'integrations', 'mcp-servers', 'export', 'sync'],
  },
  {
    page: 'notifications',
    icon: 'Bell',
    label: 'Benachrichtigungen',
    description: 'Benachrichtigungen',
    badge: 'notifications',
  },
];

// ===========================================
// Derived data for consumers
// ===========================================

/** All section nav items (flattened, excludes chat/browser/footer) */
export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(s => s.items);

/** All navigable items including chat, browser, and footer */
export const ALL_NAVIGABLE_ITEMS: NavItem[] = [
  NAV_CHAT_ITEM,
  NAV_BROWSER_ITEM,
  ...ALL_NAV_ITEMS,
  ...NAV_FOOTER_ITEMS,
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
  if (page === 'home') return { page: 'home', icon: 'LayoutDashboard', label: 'Dashboard' };
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
