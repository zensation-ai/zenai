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
  'settings': '/system',

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
  'knowledge-graph': '/wissen/connections',
  'graphrag': '/cockpit/graphrag',
  'voice-chat': '/meine-ki/voice-chat',
  'procedural-memory': '/meine-ki/procedures',
  'digital-twin': '/meine-ki/digital-twin',
  'system-admin': '/system/admin',

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
  'personalization': '/meine-ki',
  'stories': '/wissen/connections',
  'dashboard': '/',
  'ai-workshop': '/ideen/workshop',
  'mcp-servers': '/system/integrations/mcp',
  'automations': '/system/automations',
  'integrations': '/system/integrations',
  'export': '/system/data',
  'sync': '/system/data',
  'profile': '/system/profile',
};

/** Maps canonical URL paths to Page identifiers */
export const PATH_PAGES: Record<string, Page> = {
  '/': 'hub',
  '/ideen': 'ideas',
  '/planer': 'calendar',
  '/inbox': 'email',
  '/wissen': 'documents',
  '/cockpit': 'business',
  '/meine-ki': 'my-ai',
  '/system': 'settings',
};

// ============================================
// LEGACY REDIRECTS — every old URL still works
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
  { from: '/settings', to: '/system' },
  { from: '/settings/*', to: '/system/*', rewritePrefix: true },

  // Old standalone pages → merged into Smart Pages
  { from: '/browser', to: '/' },
  { from: '/workshop', to: '/ideen' },
  { from: '/workshop/*', to: '/ideen/*', rewritePrefix: true },
  { from: '/contacts', to: '/planer/kontakte' },
  { from: '/finance', to: '/cockpit/finanzen' },
  { from: '/insights', to: '/cockpit/trends' },
  { from: '/insights/*', to: '/cockpit/*', rewritePrefix: true },
  { from: '/learning', to: '/wissen/lernen' },
  { from: '/learning/*', to: '/wissen/*', rewritePrefix: true },
  { from: '/screen-memory', to: '/' },
  { from: '/notifications', to: '/inbox/benachrichtigungen' },
  { from: '/admin', to: '/system/admin' },
  { from: '/admin/*', to: '/system' },

  // Old double-legacy redirects (pre-Phase 105 legacy paths)
  { from: '/incubator', to: '/ideen/incubator' },
  { from: '/ai-workshop', to: '/ideen' },
  { from: '/ai-workshop/*', to: '/ideen' },
  { from: '/meetings', to: '/planer/meetings' },
  { from: '/automations', to: '/system/automations' },
  { from: '/integrations', to: '/system/integrations' },
  { from: '/export', to: '/system/data' },
  { from: '/sync', to: '/system/data' },
  { from: '/profile', to: '/system/profile' },
  { from: '/archive', to: '/ideen/archive' },
  { from: '/triage', to: '/ideen/triage' },
  { from: '/stories', to: '/wissen/connections' },
  { from: '/media', to: '/wissen/medien' },
  { from: '/canvas', to: '/wissen/editor' },
  { from: '/personalization', to: '/meine-ki' },
  { from: '/voice-chat', to: '/meine-ki/voice-chat' },
  { from: '/agent-teams', to: '/' },
  { from: '/dashboard', to: '/' },
  { from: '/analytics', to: '/cockpit/trends' },
  { from: '/digest', to: '/cockpit/digest' },
  { from: '/knowledge-graph', to: '/wissen/connections' },
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

// ============================================
// COCKPIT MODE ROUTES (Phase 142)
// ============================================

export const COCKPIT_ROUTES = {
  chat: '/chat',
  dashboard: '/dashboard',
  settings: '/settings',
} as const;

export function legacyPageToPanel(page: string): string | null {
  const mapping: Record<string, string> = {
    'ideas': 'ideas', 'ideas/incubator': 'ideas', 'ideas/archive': 'ideas', 'ideas/triage': 'ideas',
    'calendar': 'calendar', 'calendar/tasks': 'tasks', 'calendar/kanban': 'tasks',
    'email': 'email', 'contacts': 'contacts', 'documents': 'documents',
    'finance': 'finance', 'my-ai': 'memory', 'my-ai/memory': 'memory',
    'workshop': 'agents', 'workshop/agent-teams': 'agents',
  };
  return mapping[page] ?? null;
}

/**
 * Resolve a Page to its URL path, with optional tab suffix.
 */
export function resolvePagePath(page: Page, tab?: string): string {
  let path = PAGE_PATHS[page] || '/';

  if (tab) {
    const tabPages: Page[] = [
      'ideas', 'calendar', 'email', 'documents', 'business',
      'my-ai', 'settings', 'hub',
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
 */
export function resolvePathToPage(pathname: string): Page {
  // Direct match
  if (PATH_PAGES[pathname]) {
    return PATH_PAGES[pathname];
  }

  // Sub-path matching — new German slug prefixes
  if (pathname.startsWith('/ideen/')) return 'ideas';
  if (pathname.startsWith('/planer/')) return 'calendar';
  if (pathname.startsWith('/inbox/')) return 'email';
  if (pathname.startsWith('/wissen/')) return 'documents';
  if (pathname.startsWith('/cockpit/')) return 'business';
  if (pathname.startsWith('/meine-ki/')) return 'my-ai';
  if (pathname.startsWith('/system/')) return 'settings';

  // Sub-path matching — old English prefixes (fallback before redirect)
  if (pathname.startsWith('/ideas/')) return 'ideas';
  if (pathname.startsWith('/calendar/')) return 'calendar';
  if (pathname.startsWith('/email/')) return 'email';
  if (pathname.startsWith('/documents/')) return 'documents';
  if (pathname.startsWith('/business/')) return 'business';
  if (pathname.startsWith('/my-ai/')) return 'my-ai';
  if (pathname.startsWith('/settings/')) return 'settings';
  if (pathname.startsWith('/workshop/')) return 'ideas';
  if (pathname.startsWith('/insights/')) return 'business';
  if (pathname.startsWith('/learning/')) return 'documents';
  if (pathname.startsWith('/admin/')) return 'settings';
  if (pathname.startsWith('/browser/')) return 'hub';
  if (pathname.startsWith('/contacts/')) return 'calendar';
  if (pathname.startsWith('/finance/')) return 'business';
  if (pathname.startsWith('/screen-memory/')) return 'hub';

  // Default: unknown path → hub
  return 'hub';
}
