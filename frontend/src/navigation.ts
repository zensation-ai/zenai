/**
 * Central Navigation Configuration
 *
 * Single source of truth for all navigation items, sections, and groupings.
 * Used by Sidebar, MobileSidebarDrawer, MobileBottomBar, and CommandPalette.
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
 * Main navigation sections displayed in sidebar
 * Grouped by functional area, max 4 items per group (Miller's Law)
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'gedanken',
    label: 'Gedanken',
    icon: '💭',
    items: [
      { page: 'ideas', icon: '💭', label: 'Meine Gedanken', description: 'Ideen, Notizen und Chat' },
      { page: 'archive', icon: '📥', label: 'Archiv', description: 'Archivierte Gedanken', badge: 'archived' },
      { page: 'triage', icon: '📋', label: 'Sortieren', description: 'Gedanken einordnen' },
    ],
  },
  {
    id: 'ki',
    label: 'KI & Insights',
    icon: '🧠',
    items: [
      { page: 'insights', icon: '📊', label: 'Insights', description: 'Dashboard & Analytics', subPages: ['dashboard', 'analytics', 'digest', 'knowledge-graph'] },
      { page: 'ai-workshop', icon: '🧪', label: 'KI-Werkstatt', description: 'Inkubator & Evolution', subPages: ['incubator', 'proactive', 'evolution'] },
      { page: 'learning', icon: '📚', label: 'Lernen', description: 'Lernziele und Aufgaben', subPages: ['learning-tasks'] },
      { page: 'personalization', icon: '🎨', label: 'Personalisierung', description: 'KI auf dich anpassen' },
    ],
  },
  {
    id: 'inhalte',
    label: 'Inhalte',
    icon: '📁',
    items: [
      { page: 'documents', icon: '📄', label: 'Dokumente', description: 'Dokument-Verwaltung' },
      { page: 'canvas', icon: '🎨', label: 'Canvas', description: 'Interaktiver Editor' },
      { page: 'meetings', icon: '📅', label: 'Meetings', description: 'Meeting-Notizen' },
      { page: 'media', icon: '🖼️', label: 'Medien', description: 'Bilder und Dateien' },
      { page: 'stories', icon: '📖', label: 'Stories', description: 'Gedanken-Geschichten' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: '⚙️',
    items: [
      { page: 'automations', icon: '⚡', label: 'Automationen', description: 'Workflows automatisieren' },
      { page: 'integrations', icon: '🔗', label: 'Integrationen', description: 'Externe Dienste verbinden' },
      { page: 'export', icon: '📤', label: 'Export', description: 'Daten exportieren' },
      { page: 'sync', icon: '🔄', label: 'Sync', description: 'Geräte synchronisieren' },
    ],
  },
];

/**
 * Footer items - always visible at sidebar bottom
 */
export const NAV_FOOTER_ITEMS: NavItem[] = [
  { page: 'profile', icon: '👤', label: 'Profil', description: 'Dein Nutzerprofil' },
  { page: 'notifications', icon: '🔔', label: 'Benachrichtigungen', description: 'Benachrichtigungen', badge: 'notifications' },
  { page: 'settings', icon: '⚙️', label: 'Einstellungen', description: 'App-Konfiguration' },
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

  for (const section of NAV_SECTIONS) {
    const item = section.items.find(i => i.page === page || i.subPages?.includes(page));
    if (item) return item.label;
  }

  const footerItem = NAV_FOOTER_ITEMS.find(i => i.page === page);
  if (footerItem) return footerItem.label;

  return 'My Brain';
}

/**
 * Find NavItem by page identifier (searches sections + footer)
 */
export function getNavItemByPage(page: Page): NavItem | undefined {
  if (page === 'home') return { page: 'home', icon: '🏠', label: 'Dashboard' };

  for (const section of NAV_SECTIONS) {
    const item = section.items.find(i => i.page === page || i.subPages?.includes(page));
    if (item) return item;
  }

  return NAV_FOOTER_ITEMS.find(i => i.page === page);
}
