/**
 * Route Definitions — Phase 105 (Zenith Navigation)
 *
 * German slug canonical URLs with comprehensive legacy redirects.
 * Every old URL resolves to its new location. Zero dead links.
 */

import { Navigate, useParams } from 'react-router-dom';
import type { Page } from '../types';

// ============================================
// CANONICAL URL PATHS
// ============================================

/** Maps Page identifiers to their canonical URL paths */
export const PAGE_PATHS: Record<Page, string> = {
  // ── Smart Pages (7+1) ──
  'hub': '/',
  'ideas': '/ideen',
  'calendar': '/planer',
  'email': '/inbox',
  'documents': '/wissen',
  'business': '/cockpit',
  'my-ai': '/meine-ki',
  'settings-user': '/system/benutzer',
  'settings-ai': '/system/ki',
  'settings-integrations': '/system/integrationen',
  'settings-admin': '/system/admin',

  // ── Active sub-pages ──
  'contacts': '/planer/kontakte',
  'finance': '/cockpit/finanzen',
  'insights': '/cockpit/trends',
  'learning': '/wissen/lernen',
  'notifications': '/inbox/benachrichtigungen',
  'screen-memory': '/',
  'memory-insights': '/meine-ki/memory-insights',

  // ── Sub-tabs ──
  'tasks': '/planer/tasks',
  'kanban': '/planer/kanban',
  'gantt': '/planer/gantt',
  'meetings': '/planer/meetings',
  'canvas': '/wissen/editor',
  'media': '/wissen/medien',
  'analytics': '/cockpit/trends',
  'digest': '/cockpit/digest',
  'knowledge-graph': '/wissen',
  'graphrag': '/cockpit/graphrag',
  'voice-chat': '/meine-ki/voice-chat',
  'procedural-memory': '/meine-ki/procedures',
  'digital-twin': '/meine-ki/digital-twin',
  'system-admin': '/system/admin/system',
  'billing': '/system/benutzer/billing',
  'social': '/cockpit/social',

  // ── Legacy redirect-only (all map to canonical paths) ──
  'home': '/',
  'chat': '/',
  'browser': '/',
  'workshop': '/ideen/workshop',
  'incubator': '/ideen/incubator',
  'archive': '/ideen/archive',
  'triage': '/ideen/triage',
  'proactive': '/ideen/proactive',
  'evolution': '/ideen/evolution',
  'agent-teams': '/',
  'learning-tasks': '/planer/tasks',
  // 'personalization', 'stories', 'dashboard' removed from Page type — see LEGACY_REDIRECTS
  'ai-workshop': '/ideen/workshop',
  'mcp-servers': '/system/integrationen/mcp-servers',
  'automations': '/system/ki/automations',
  'integrations': '/system/integrationen',
  'export': '/system/benutzer/data',
  'sync': '/system/benutzer/data',
  'profile': '/system/benutzer/profile',
};

/** Maps canonical URL paths to Page identifiers.
 *  Sub-page paths MUST be listed here so resolvePathToPage() matches them
 *  before falling back to parent prefix matching.
 */
export const PATH_PAGES: Record<string, Page> = {
  '/': 'hub',
  '/chat': 'hub',
  '/ideen': 'ideas',
  '/planer': 'calendar',
  '/inbox': 'email',
  '/wissen': 'documents',
  '/cockpit': 'business',
  '/meine-ki': 'my-ai',
  '/system/benutzer': 'settings-user',
  '/system/ki': 'settings-ai',
  '/system/integrationen': 'settings-integrations',
  '/system/admin': 'settings-admin',

  // ── Workspace sub-pages (promoted to sidebar-level navigation) ──
  '/planer/kontakte': 'contacts',
  '/cockpit/finanzen': 'finance',
  '/cockpit/trends': 'insights',
  '/wissen/lernen': 'learning',
  '/ideen/workshop': 'workshop',

  // ── Sub-tabs that need specific page resolution ──
  '/planer/tasks': 'tasks',
  '/planer/aufgaben': 'tasks',   // German alias for /planer/tasks
  '/planer/kanban': 'kanban',
  '/planer/gantt': 'gantt',
  '/planer/meetings': 'meetings',
  '/wissen/editor': 'canvas',
  '/wissen/medien': 'media',
  '/wissen/connections': 'documents',
  '/cockpit/digest': 'digest',
  '/cockpit/graphrag': 'graphrag',
  '/meine-ki/voice-chat': 'voice-chat',
  '/meine-ki/procedures': 'procedural-memory',
  '/meine-ki/digital-twin': 'digital-twin',
  '/meine-ki/memory-insights': 'memory-insights',
  '/inbox/benachrichtigungen': 'notifications',
  '/system/admin/system': 'system-admin',
  '/system/benutzer/billing': 'billing',
  '/cockpit/social': 'social',
  '/ideen/incubator': 'incubator',
  '/ideen/archive': 'archive',
  '/ideen/triage': 'triage',
  '/ideen/proactive': 'proactive',
  '/ideen/evolution': 'evolution',
};

// ============================================
// LEGACY REDIRECTS — every old URL still works
// Legacy redirects — scheduled for removal 2026-09-26
// ============================================

/** Legacy paths that should redirect to their new canonical locations.
 *  When `rewritePrefix` is true, the wildcard segment from `from` is appended
 *  to the `to` base (e.g., /ideas/archive → /ideen/archive).
 */
export const LEGACY_REDIRECTS: Array<{ from: string; to: string; rewritePrefix?: boolean }> = [
  // Old primary routes → new German slugs
  { from: '/chat', to: '/' },
  { from: '/ideas', to: '/ideen' },
  { from: '/ideas/*', to: '/ideen/*', rewritePrefix: true },
  { from: '/calendar', to: '/planer' },
  { from: '/calendar/*', to: '/planer/*', rewritePrefix: true },
  { from: '/email', to: '/inbox' },
  { from: '/email/*', to: '/inbox/*', rewritePrefix: true },
  { from: '/documents', to: '/wissen' },
  { from: '/documents/*', to: '/wissen/*', rewritePrefix: true },
  { from: '/business', to: '/cockpit' },
  { from: '/business/*', to: '/cockpit/*', rewritePrefix: true },
  { from: '/my-ai', to: '/meine-ki' },
  { from: '/my-ai/*', to: '/meine-ki/*', rewritePrefix: true },
  { from: '/settings', to: '/system/benutzer' },
  { from: '/settings/*', to: '/system/benutzer', },
  { from: '/einstellungen/abonnement', to: '/system/benutzer/billing' },

  // Old standalone pages → merged into Smart Pages
  { from: '/browser', to: '/' },
  { from: '/workshop', to: '/ideen' },
  { from: '/workshop/*', to: '/ideen/*', rewritePrefix: true },
  { from: '/contacts', to: '/planer/kontakte' },
  { from: '/finance', to: '/cockpit/finanzen' },
  { from: '/insights', to: '/cockpit/trends' },
  { from: '/insights/*', to: '/cockpit/trends/*', rewritePrefix: true },
  { from: '/learning', to: '/wissen/lernen' },
  { from: '/learning/*', to: '/wissen/lernen/*', rewritePrefix: true },
  { from: '/screen-memory', to: '/' },
  { from: '/notifications', to: '/inbox/benachrichtigungen' },
  { from: '/system', to: '/system/benutzer' },
  { from: '/system/profile', to: '/system/benutzer' },
  { from: '/system/automations', to: '/system/ki' },
  { from: '/system/integrations', to: '/system/integrationen' },
  { from: '/system/data', to: '/system/benutzer/data' },
  { from: '/admin', to: '/system/admin' },
  { from: '/admin/*', to: '/system/admin' },

  // Old double-legacy redirects (pre-Phase 105 legacy paths)
  { from: '/incubator', to: '/ideen/incubator' },
  { from: '/ai-workshop', to: '/ideen' },
  { from: '/ai-workshop/*', to: '/ideen' },
  { from: '/meetings', to: '/planer/meetings' },
  { from: '/automations', to: '/system/ki' },
  { from: '/integrations', to: '/system/integrationen' },
  { from: '/export', to: '/system/benutzer/data' },
  { from: '/sync', to: '/system/benutzer/data' },
  { from: '/profile', to: '/system/benutzer' },
  { from: '/archive', to: '/ideen/archive' },
  { from: '/triage', to: '/ideen/triage' },
  { from: '/stories', to: '/wissen' },
  { from: '/media', to: '/wissen/medien' },
  { from: '/canvas', to: '/wissen/editor' },
  { from: '/personalization', to: '/meine-ki' },
  { from: '/voice-chat', to: '/meine-ki/voice-chat' },
  { from: '/agent-teams', to: '/' },
  { from: '/dashboard', to: '/' },
  { from: '/analytics', to: '/cockpit/trends' },
  { from: '/digest', to: '/cockpit/digest' },
  { from: '/knowledge-graph', to: '/wissen' },
  { from: '/learning-tasks', to: '/planer/tasks' },
];

/**
 * Create redirect elements for legacy paths.
 * Used inside <Routes> to handle old URLs.
 * For rewritePrefix entries, uses a wrapper component that reads the wildcard
 * param and appends it to the target base path.
 */
function PrefixRedirect({ toBase }: { toBase: string }) {
  const params = useParams();
  const wildcard = params['*'] || '';
  const target = wildcard ? `${toBase}/${wildcard}` : toBase;
  return <Navigate to={target} replace />;
}

export function createLegacyRedirects() {
  return LEGACY_REDIRECTS.map(({ from, to, rewritePrefix }) => {
    if (rewritePrefix) {
      const toBase = to.replace('/*', '');
      return {
        path: from,
        element: <PrefixRedirect toBase={toBase} />,
      };
    }
    return {
      path: from,
      element: <Navigate to={to} replace />,
    };
  });
}

/**
 * Resolve a Page to its URL path, with optional tab suffix.
 */
export function resolvePagePath(page: Page, tab?: string): string {
  let path = PAGE_PATHS[page] || '/';

  if (tab) {
    const tabPages: Page[] = [
      'ideas', 'calendar', 'email', 'documents', 'business',
      'my-ai', 'settings-user', 'settings-ai', 'settings-integrations', 'settings-admin', 'hub',
    ];
    if (tabPages.includes(page)) {
      path = `${PAGE_PATHS[page]}/${tab}`;
    }
  }

  return path;
}

/**
 * Resolve a pathname to its Page identifier.
 * Handles both new German slugs and old English paths (for transition period).
 * Returns undefined for unknown paths so callers can render a 404 page.
 */
export function resolvePathToPage(pathname: string): Page | undefined {
  // Direct match
  if (PATH_PAGES[pathname]) {
    return PATH_PAGES[pathname];
  }

  // Sub-path matching — new German slug prefixes
  // More specific prefixes MUST come before their parent prefix
  if (pathname.startsWith('/ideen/')) return 'ideas';
  if (pathname.startsWith('/planer/')) return 'calendar';
  if (pathname.startsWith('/inbox/')) return 'email';
  if (pathname.startsWith('/wissen/lernen')) return 'learning';
  if (pathname.startsWith('/wissen/')) return 'documents';
  if (pathname.startsWith('/cockpit/trends')) return 'insights';
  if (pathname.startsWith('/cockpit/finanzen')) return 'finance';
  if (pathname.startsWith('/cockpit/social')) return 'social';
  if (pathname.startsWith('/cockpit/')) return 'business';
  if (pathname.startsWith('/meine-ki/')) return 'my-ai';
  if (pathname.startsWith('/system/benutzer')) return 'settings-user';
  if (pathname.startsWith('/system/ki')) return 'settings-ai';
  if (pathname.startsWith('/system/integrationen')) return 'settings-integrations';
  if (pathname.startsWith('/system/admin')) return 'settings-admin';

  // Sub-path matching — old English prefixes (fallback before redirect)
  if (pathname.startsWith('/ideas/')) return 'ideas';
  if (pathname.startsWith('/calendar/')) return 'calendar';
  if (pathname.startsWith('/email/')) return 'email';
  if (pathname.startsWith('/documents/')) return 'documents';
  if (pathname.startsWith('/business/')) return 'business';
  if (pathname.startsWith('/my-ai/')) return 'my-ai';
  if (pathname.startsWith('/settings/')) return 'settings-user';
  if (pathname.startsWith('/workshop/')) return 'ideas';
  if (pathname.startsWith('/insights/')) return 'business';
  if (pathname.startsWith('/learning/')) return 'documents';
  if (pathname.startsWith('/admin/')) return 'settings-admin';
  if (pathname.startsWith('/browser/')) return 'hub';
  if (pathname.startsWith('/contacts/')) return 'calendar';
  if (pathname.startsWith('/finance/')) return 'finance';
  if (pathname.startsWith('/screen-memory/')) return 'hub';

  // Legacy exact-path matching — old English slugs without trailing slash
  const LEGACY_EXACT: Record<string, Page> = {
    '/ideas': 'ideas',
    '/calendar': 'calendar',
    '/email': 'email',
    '/documents': 'documents',
    '/business': 'business',
    '/my-ai': 'my-ai',
    '/settings': 'settings-user',
    '/workshop': 'ideas',
    '/contacts': 'contacts',
    '/finance': 'finance',
    '/insights': 'insights',
    '/learning': 'learning',
    '/notifications': 'notifications',
    '/browser': 'hub',
    '/screen-memory': 'hub',
    '/admin': 'settings-admin',
    '/incubator': 'ideas',
    '/ai-workshop': 'ideas',
    '/meetings': 'calendar',
    '/automations': 'settings-ai',
    '/integrations': 'settings-integrations',
    '/export': 'settings-user',
    '/sync': 'settings-user',
    '/profile': 'settings-user',
    '/archive': 'ideas',
    '/triage': 'ideas',
    '/stories': 'documents',
    '/media': 'documents',
    '/canvas': 'documents',
    '/personalization': 'my-ai',
    '/voice-chat': 'my-ai',
    '/agent-teams': 'hub',
    '/dashboard': 'hub',
    '/analytics': 'insights',
    '/digest': 'insights',
    '/knowledge-graph': 'documents',
    '/learning-tasks': 'calendar',
    '/system': 'settings-user',
  };
  if (LEGACY_EXACT[pathname]) {
    return LEGACY_EXACT[pathname];
  }

  // Unknown path — return undefined to trigger 404
  return undefined;
}
