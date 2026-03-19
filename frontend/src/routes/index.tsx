/**
 * Route Definitions — React Router v6/v7 route configuration.
 *
 * Defines all application routes with:
 * - Lazy-loaded page components (code splitting)
 * - Legacy path redirects
 * - Wildcard catch-all for 404
 *
 * The AppLayout wraps all routes as a layout element.
 * Page components receive props via the AppRoutes wrapper in App.tsx.
 */

import { Navigate } from 'react-router-dom';
import type { Page } from '../types';

// ============================================
// URL PATH MAPPINGS (preserved from App.tsx)
// ============================================

/** Maps Page identifiers to their canonical URL paths */
export const PAGE_PATHS: Record<Page, string> = {
  // Chat Hub (Phase 105)
  'hub': '/',
  // Primary pages (active routes)
  'home': '/',
  'chat': '/chat',
  'browser': '/browser',
  'contacts': '/contacts',
  'finance': '/finance',
  'ideas': '/ideas',
  'workshop': '/workshop',
  'insights': '/insights',
  'documents': '/documents',
  'calendar': '/calendar',
  'email': '/email',
  'business': '/business',
  'learning': '/learning',
  'my-ai': '/my-ai',
  'screen-memory': '/screen-memory',
  'settings': '/settings',
  'notifications': '/notifications',
  // Legacy pages (redirect to new locations)
  'incubator': '/ideas/incubator',
  'ai-workshop': '/workshop',
  'meetings': '/calendar/meetings',
  'tasks': '/calendar/tasks',
  'kanban': '/calendar/kanban',
  'gantt': '/calendar/gantt',
  'automations': '/settings/automations',
  'integrations': '/settings/integrations',
  'export': '/settings/data',
  'sync': '/settings/data',
  'profile': '/settings/profile',
  'archive': '/ideas/archive',
  'triage': '/ideas/triage',
  'stories': '/insights/connections',
  'media': '/documents',
  'canvas': '/documents/editor',
  'personalization': '/my-ai',
  'proactive': '/workshop/proactive',
  'evolution': '/workshop/evolution',
  'dashboard': '/insights/analytics',
  'analytics': '/insights/analytics',
  'digest': '/insights/digest',
  'knowledge-graph': '/insights/connections',
  'learning-tasks': '/learning',
  'voice-chat': '/my-ai/voice-chat',
  'memory-insights': '/my-ai/memory-insights',
  'agent-teams': '/workshop/agent-teams',
  'mcp-servers': '/settings/integrations/mcp',
  'system-admin': '/admin',
  'graphrag': '/insights/graphrag',
  'procedural-memory': '/my-ai/procedures',
  'digital-twin': '/my-ai/digital-twin',
};

/** Maps URL paths to Page identifiers */
export const PATH_PAGES: Record<string, Page> = {
  // Primary routes
  '/': 'home',
  '/chat': 'chat',
  '/browser': 'browser',
  '/contacts': 'contacts',
  '/finance': 'finance',
  '/ideas': 'ideas',
  '/workshop': 'workshop',
  '/insights': 'insights',
  '/documents': 'documents',
  '/calendar': 'calendar',
  '/email': 'email',
  '/business': 'business',
  '/learning': 'learning',
  '/my-ai': 'my-ai',
  '/screen-memory': 'screen-memory',
  '/settings': 'settings',
  '/notifications': 'notifications',
  // Legacy paths -> redirect to primary pages
  '/incubator': 'ideas',
  '/ai-workshop': 'workshop',
  '/meetings': 'calendar',
  '/automations': 'settings',
  '/integrations': 'settings',
  '/export': 'settings',
  '/sync': 'settings',
  '/profile': 'settings',
  '/archive': 'ideas',
  '/triage': 'ideas',
  '/stories': 'insights',
  '/media': 'documents',
  '/canvas': 'documents',
  '/personalization': 'my-ai',
  '/voice-chat': 'my-ai',
  '/agent-teams': 'workshop',
  '/admin': 'system-admin',
};

// ============================================
// LEGACY REDIRECT DEFINITIONS
// ============================================

/** Legacy paths that should redirect to their new locations */
export const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/incubator', to: '/ideas/incubator' },
  { from: '/ai-workshop', to: '/workshop' },
  { from: '/ai-workshop/*', to: '/workshop' },
  { from: '/meetings', to: '/calendar/meetings' },
  { from: '/automations', to: '/settings/automations' },
  { from: '/integrations', to: '/settings/integrations' },
  { from: '/export', to: '/settings/data' },
  { from: '/sync', to: '/settings/data' },
  { from: '/profile', to: '/settings/profile' },
  { from: '/archive', to: '/ideas/archive' },
  { from: '/triage', to: '/ideas/triage' },
  { from: '/stories', to: '/insights/connections' },
  { from: '/media', to: '/documents' },
  { from: '/canvas', to: '/documents/editor' },
  { from: '/personalization', to: '/my-ai' },
  { from: '/voice-chat', to: '/my-ai/voice-chat' },
  { from: '/agent-teams', to: '/workshop/agent-teams' },
  { from: '/dashboard', to: '/insights/analytics' },
  { from: '/analytics', to: '/insights/analytics' },
  { from: '/digest', to: '/insights/digest' },
  { from: '/knowledge-graph', to: '/insights/connections' },
  { from: '/learning-tasks', to: '/learning' },
];

/**
 * Create redirect elements for legacy paths.
 * Used inside <Routes> to handle old URLs.
 */
export function createLegacyRedirects() {
  return LEGACY_REDIRECTS.map(({ from, to }) => ({
    path: from,
    element: <Navigate to={to} replace />,
  }));
}

/**
 * Resolve a Page to its URL path, with optional tab suffix.
 */
export function resolvePagePath(page: Page, tab?: string): string {
  let path = PAGE_PATHS[page] || '/';

  if (tab) {
    const tabPages: Page[] = [
      'insights', 'workshop', 'documents', 'ideas', 'my-ai', 'settings',
      'business', 'calendar', 'email', 'learning', 'contacts', 'finance',
      'screen-memory', 'memory-insights', 'system-admin',
    ];
    if (tabPages.includes(page)) {
      path = `${PAGE_PATHS[page]}/${tab}`;
    }
  }

  return path;
}

/**
 * Resolve a pathname to its Page identifier.
 */
export function resolvePathToPage(pathname: string): Page {
  const fullPath = pathname;

  if (PATH_PAGES[fullPath]) {
    return PATH_PAGES[fullPath];
  }

  if (fullPath.startsWith('/insights/')) return 'insights';
  if (fullPath.startsWith('/workshop/')) return 'workshop';
  if (fullPath.startsWith('/documents/')) return 'documents';
  if (fullPath.startsWith('/calendar/')) return 'calendar';
  if (fullPath.startsWith('/browser/')) return 'browser';
  if (fullPath.startsWith('/contacts/')) return 'contacts';
  if (fullPath.startsWith('/finance/')) return 'finance';
  if (fullPath.startsWith('/email/')) return 'email';
  if (fullPath.startsWith('/business/')) return 'business';
  if (fullPath.startsWith('/ideas/')) return 'ideas';
  if (fullPath.startsWith('/my-ai/')) return 'my-ai';
  if (fullPath.startsWith('/settings/')) return 'settings';
  if (fullPath.startsWith('/learning/')) return 'learning';
  if (fullPath.startsWith('/screen-memory/')) return 'screen-memory';
  if (fullPath.startsWith('/admin/')) return 'system-admin';
  if (fullPath.startsWith('/ai-workshop/')) return 'workshop';

  const basePath = '/' + fullPath.split('/').slice(1, 2).join('/') || '/';
  return PATH_PAGES[basePath] || 'home';
}
