/**
 * buildBreadcrumbs — Compute breadcrumb items from navigation config
 *
 * Derives breadcrumb trails from the current page using findNavItemForPage()
 * from navigation.ts. Returns an array of BreadcrumbItems for rendering.
 */

import type { Page } from '../types';
import { findNavItemForPage, NAV_HUB_ITEM } from '../navigation';
import type { BreadcrumbItem } from '../components/Breadcrumbs';

/** Page-specific labels for sub-pages (tabs within a parent) */
const SUB_PAGE_LABELS: Partial<Record<Page, string>> = {
  incubator: 'Inkubator',
  archive: 'Archiv',
  triage: 'Sortieren',
  workshop: 'Werkstatt',
  proactive: 'Vorschläge',
  evolution: 'Entwicklung',
  'agent-teams': 'Agenten',
  'ai-workshop': 'Werkstatt',
  tasks: 'Aufgaben',
  kanban: 'Kanban',
  gantt: 'Gantt',
  meetings: 'Meetings',
  canvas: 'Editor',
  media: 'Medien',
  analytics: 'Statistiken',
  digest: 'Zusammenfassung',
  'knowledge-graph': 'Verbindungen',
  graphrag: 'GraphRAG',
  'voice-chat': 'Sprach-Chat',
  'procedural-memory': 'Prozeduren',
  'digital-twin': 'Digital Twin',
  'memory-insights': 'Memory Insights',
  profile: 'Profil',
  automations: 'Automationen',
  integrations: 'Integrationen',
  'mcp-servers': 'MCP Server',
  export: 'Daten',
  sync: 'Daten',
  'system-admin': 'Admin',
  contacts: 'Kontakte',
  finance: 'Finanzen',
  insights: 'Einblicke',
  learning: 'Lernen',
  notifications: 'Benachrichtigungen',
  'learning-tasks': 'Aufgaben',
  'settings-user': 'System',
  'settings-ai': 'KI-Einstellungen',
  'settings-integrations': 'Integrationen',
  'settings-admin': 'Administration',
};

/**
 * Build breadcrumb items for the given page.
 *
 * Trail structure:
 * - Root pages (hub): [Hub]
 * - Top-level nav pages (ideas, calendar, etc.): [Hub, Page]
 * - Sub-pages (incubator, tasks, etc.): [Hub, Parent, SubPage]
 */
export function buildBreadcrumbs(currentPage: Page, _tabLabel?: string): BreadcrumbItem[] {
  const ROOT: BreadcrumbItem = {
    label: NAV_HUB_ITEM.label,
    page: NAV_HUB_ITEM.page,
    icon: NAV_HUB_ITEM.icon,
  };

  // Hub/home/chat are root level
  if (currentPage === 'hub' || currentPage === 'home' || currentPage === 'chat') {
    return [ROOT];
  }

  const navItem = findNavItemForPage(currentPage);
  if (!navItem) {
    // Unknown page — show root + page name
    return [ROOT, { label: currentPage, page: currentPage }];
  }

  // If this page IS the nav item's primary page, it's a top-level page
  if (navItem.page === currentPage) {
    return [ROOT, { label: navItem.label, page: navItem.page, icon: navItem.icon }];
  }

  // This is a sub-page — show parent + sub-page
  const subLabel = SUB_PAGE_LABELS[currentPage] ?? currentPage;
  return [
    ROOT,
    { label: navItem.label, page: navItem.page, icon: navItem.icon },
    { label: subLabel, page: currentPage },
  ];
}
