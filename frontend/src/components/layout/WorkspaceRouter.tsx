/**
 * WorkspaceRouter — Maps currentPage to the correct full-page component
 *
 * Uses lazy-loaded components from LazyPages for code splitting.
 * Each page receives its expected props (context, initialTab, onBack, etc.)
 *
 * Note: Many page components define their tab types locally (not exported),
 * so we use type assertions for initialTab props. The PAGE_TAB_MAP ensures
 * only valid tab strings are passed at runtime.
 */

import { Suspense } from 'react';
import type { Page } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { PageTransition } from '../PageTransition';
import {
  IdeasPage,
  PlannerPage,
  EmailPage,
  ContactsPage,
  DocumentVaultPage,
  LearningDashboard,
  BusinessDashboard,
  FinancePage,
  InsightsDashboard,
  MyAIPage,
  AIWorkshop,
  UserSettingsPage,
  AISettingsPage,
  IntegrationsSettingsPage,
  AdminSettingsPage,
  ChatHub,
  SocialMediaPage,
} from '../../routes/LazyPages';

interface WorkspaceRouterProps {
  currentPage: Page;
  context: AIContext;
  initialTab?: string;
  onNavigate: (page: Page) => void;
}

/** Page-to-tab mapping for pages that resolve to a parent component with a tab */
const PAGE_TAB_MAP: Partial<Record<Page, string>> = {
  incubator: 'incubator',
  archive: 'archive',
  triage: 'triage',
  tasks: 'tasks',
  kanban: 'tasks',
  gantt: 'projects',
  meetings: 'meetings',
  canvas: 'editor',
  media: 'media',
  notifications: 'notifications',
  'voice-chat': 'voice-chat',
  'digital-twin': 'digital-twin',
  'procedural-memory': 'procedures',
  'memory-insights': 'memory',
  proactive: 'proactive',
  evolution: 'evolution',
  'agent-teams': 'agent-teams',
  analytics: 'analytics',
  digest: 'digest',
  graphrag: 'graphrag',
  'system-admin': 'system',
  billing: 'billing',
  profile: 'profile',
  automations: 'automations',
  integrations: 'integrations',
  'mcp-servers': 'mcp-servers',
  export: 'data',
  sync: 'data',
  // finance, insights, learning: rendered as standalone pages, not as parent tabs.
  // Tab extraction handled by URL-based tabParam in App.tsx.
};

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-sm text-[var(--color-text-muted,#888)]">Laden...</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export function WorkspaceRouter({ currentPage, context, initialTab, onNavigate }: WorkspaceRouterProps) {
  // Prefer PAGE_TAB_MAP for sub-pages (e.g. 'kanban' → 'tasks') over raw URL segment
  const tab = PAGE_TAB_MAP[currentPage] ?? initialTab;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function renderPage() {
    switch (currentPage) {
      // Ideas group
      case 'ideas':
      case 'incubator':
      case 'archive':
      case 'triage':
        return <IdeasPage context={context} initialTab={tab} onNavigate={onNavigate as (page: string) => void} />;

      // Planner group
      case 'calendar':
      case 'tasks':
      case 'kanban':
      case 'gantt':
      case 'meetings':
        return <PlannerPage context={context} initialTab={(tab ?? 'calendar') as any} onBack={noop} />;

      // Email / Notifications
      case 'email':
      case 'notifications':
        return <EmailPage context={context} initialTab={tab} />;

      // Contacts
      case 'contacts':
        return <ContactsPage context={context} initialTab={(tab ?? 'all') as any} onBack={noop} />;

      // Documents / Canvas / Media / Knowledge Graph
      case 'documents':
      case 'canvas':
      case 'media':
      case 'knowledge-graph':
        return <DocumentVaultPage context={context} initialTab={tab as any} onBack={noop} />;

      // Learning
      case 'learning':
        return <LearningDashboard context={context} initialTab={tab as any} onBack={noop} />;

      // Business
      case 'business':
        return <BusinessDashboard context={context} initialTab={tab as any} onBack={noop} />;

      // Finance
      case 'finance':
        return <FinancePage context={context} initialTab={tab as any} onBack={noop} />;

      // Insights / Analytics / Digest / GraphRAG
      case 'insights':
      case 'analytics':
      case 'digest':
      case 'graphrag':
        return <InsightsDashboard context={context} initialTab={tab as any} onBack={noop} />;

      // My AI
      case 'my-ai':
      case 'voice-chat':
      case 'digital-twin':
      case 'procedural-memory':
      case 'memory-insights':
        return <MyAIPage context={context} initialTab={tab as any} onBack={noop} onNavigate={onNavigate} />;

      // Workshop
      case 'workshop':
      case 'proactive':
      case 'evolution':
      case 'agent-teams':
        return <AIWorkshop context={context} initialTab={tab as any} onBack={noop} />;

      // Settings — User
      case 'settings-user':
      case 'profile':
      case 'export':
      case 'sync':
      case 'billing':
        return <UserSettingsPage context={context} initialTab={(tab ?? 'general') as any} onBack={noop} onNavigate={onNavigate} />;

      // Settings — AI
      case 'settings-ai':
      case 'automations':
        return <AISettingsPage context={context} initialTab={(tab ?? 'ai') as any} onBack={noop} onNavigate={onNavigate} />;

      // Settings — Integrations
      case 'settings-integrations':
      case 'integrations':
      case 'mcp-servers':
        return <IntegrationsSettingsPage context={context} initialTab={(tab ?? 'integrations') as any} onBack={noop} onNavigate={onNavigate} />;

      // Settings — Admin
      case 'settings-admin':
      case 'system-admin':
        return <AdminSettingsPage context={context} initialTab={(tab ?? 'governance') as any} onBack={noop} onNavigate={onNavigate} />;

      // Social Media Agent
      case 'social':
        return <SocialMediaPage context={context} initialTab={tab} />;

      // Legacy pages without dedicated routes — fall through to hub
      case 'browser':
      case 'screen-memory':

      // Chat Hub (default fallback) — full-height, no scroll
      case 'hub':
      case 'chat':
      case 'home':
      default:
        return (
          <div className="h-[calc(100dvh-52px)] flex flex-col overflow-hidden">
            <ChatHub context={context} />
          </div>
        );
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <Suspense fallback={<PageFallback />}>
      <PageTransition pageKey={currentPage}>
        {renderPage()}
      </PageTransition>
    </Suspense>
  );
}

export default WorkspaceRouter;
