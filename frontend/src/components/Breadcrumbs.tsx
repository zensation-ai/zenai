import { memo } from 'react';
import type { Page } from '../types';
import { getPageIcon } from '../utils/navIcons';
import './Breadcrumbs.css';

export interface BreadcrumbItem {
  label: string;
  page: Page;
  icon?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (page: Page) => void;
  separator?: string;
}

/**
 * Breadcrumb navigation component for improved orientation
 * Shows the current navigation path with clickable ancestors
 */
export const Breadcrumbs = memo(function Breadcrumbs({
  items,
  onNavigate,
  separator = '/'
}: BreadcrumbsProps) {
  if (items.length <= 1) {
    return null; // Don't show breadcrumbs for root-level pages
  }

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb-Navigation">
      <ol className="breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.page}-${index}`} className="breadcrumb-item">
              {isLast ? (
                <span className="breadcrumb-current" aria-current="page">
                  {item.icon && (() => { const Icon = getPageIcon(item.page); return <span className="breadcrumb-icon" aria-hidden="true"><Icon size={14} strokeWidth={1.5} /></span>; })()}
                  <span className="breadcrumb-label">{item.label}</span>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className="breadcrumb-link neuro-hover-lift"
                    onClick={() => onNavigate(item.page)}
                  >
                    {item.icon && (() => { const Icon = getPageIcon(item.page); return <span className="breadcrumb-icon" aria-hidden="true"><Icon size={14} strokeWidth={1.5} /></span>; })()}
                    <span className="breadcrumb-label">{item.label}</span>
                  </button>
                  <span className="breadcrumb-separator" aria-hidden="true">{separator}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

/**
 * Breadcrumb mapping for all pages
 * Defines the navigation hierarchy
 */
const ROOT: BreadcrumbItem = { label: 'Dashboard', page: 'home', icon: 'LayoutDashboard' };

export const BREADCRUMB_MAP: Record<Page, BreadcrumbItem[]> = {
  // Dashboard root
  'home': [ROOT],

  // Chat
  'chat': [ROOT, { label: 'Chat', page: 'chat', icon: 'MessageSquare' }],

  // Browser
  'browser': [ROOT, { label: 'Browser', page: 'browser', icon: 'Globe' }],

  // Kontakte
  'contacts': [ROOT, { label: 'Kontakte', page: 'contacts', icon: 'Users' }],

  // Finanzen
  'finance': [ROOT, { label: 'Finanzen', page: 'finance', icon: 'Wallet' }],

  // Ideen: Gedanken
  'ideas': [ROOT, { label: 'Gedanken', page: 'ideas', icon: 'Lightbulb' }],
  'incubator': [
    ROOT,
    { label: 'Gedanken', page: 'ideas', icon: 'Lightbulb' },
    { label: 'Inkubator', page: 'incubator', icon: 'Lightbulb' },
  ],
  'archive': [
    ROOT,
    { label: 'Gedanken', page: 'ideas', icon: 'Lightbulb' },
    { label: 'Archiv', page: 'archive', icon: 'Lightbulb' },
  ],
  'triage': [
    ROOT,
    { label: 'Gedanken', page: 'ideas', icon: 'Lightbulb' },
    { label: 'Sortieren', page: 'triage', icon: 'Lightbulb' },
  ],

  // Ideen: Werkstatt
  'workshop': [ROOT, { label: 'Werkstatt', page: 'workshop', icon: 'Wrench' }],
  'ai-workshop': [ROOT, { label: 'Werkstatt', page: 'workshop', icon: 'Wrench' }],
  'proactive': [
    ROOT,
    { label: 'Werkstatt', page: 'workshop', icon: 'Wrench' },
    { label: 'Vorschlaege', page: 'proactive', icon: 'Sparkles' },
  ],
  'evolution': [
    ROOT,
    { label: 'Werkstatt', page: 'workshop', icon: 'Wrench' },
    { label: 'Entwicklung', page: 'evolution', icon: 'Wrench' },
  ],
  'agent-teams': [
    ROOT,
    { label: 'Werkstatt', page: 'workshop', icon: 'Wrench' },
    { label: 'Agenten', page: 'agent-teams', icon: 'Wrench' },
  ],
  'mcp-servers': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: 'Settings' },
    { label: 'MCP Server', page: 'mcp-servers', icon: 'Settings' },
  ],

  // Auswerten: Insights
  'insights': [ROOT, { label: 'Insights', page: 'insights', icon: 'BarChart3' }],
  'dashboard': [ROOT, { label: 'Insights', page: 'insights', icon: 'BarChart3' }],
  'analytics': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: 'BarChart3' },
    { label: 'Statistiken', page: 'analytics', icon: 'BarChart3' },
  ],
  'digest': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: 'BarChart3' },
    { label: 'Zusammenfassung', page: 'digest', icon: 'BarChart3' },
  ],
  'knowledge-graph': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: 'BarChart3' },
    { label: 'Verbindungen', page: 'knowledge-graph', icon: 'BarChart3' },
  ],

  // Organisieren: E-Mail
  'email': [ROOT, { label: 'E-Mail', page: 'email', icon: 'Mail' }],

  // Organisieren: Wissensbasis
  'documents': [ROOT, { label: 'Wissensbasis', page: 'documents', icon: 'FileText' }],
  'canvas': [
    ROOT,
    { label: 'Wissensbasis', page: 'documents', icon: 'FileText' },
    { label: 'Editor', page: 'canvas', icon: 'FileText' },
  ],
  'media': [
    ROOT,
    { label: 'Wissensbasis', page: 'documents', icon: 'FileText' },
    { label: 'Medien', page: 'media', icon: 'FileText' },
  ],
  'meetings': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: 'Calendar' },
    { label: 'Meetings', page: 'meetings', icon: 'Calendar' },
  ],

  // Organisieren: Planer
  'calendar': [ROOT, { label: 'Planer', page: 'calendar', icon: 'Calendar' }],
  'tasks': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: 'Calendar' },
    { label: 'Aufgaben', page: 'tasks', icon: 'Calendar' },
  ],
  'kanban': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: 'Calendar' },
    { label: 'Kanban', page: 'kanban', icon: 'Calendar' },
  ],
  'gantt': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: 'Calendar' },
    { label: 'Gantt', page: 'gantt', icon: 'Calendar' },
  ],

  // Auswerten: Business
  'business': [ROOT, { label: 'Business', page: 'business', icon: 'Briefcase' }],

  // KI & Lernen: Lernen
  'learning': [ROOT, { label: 'Lernen', page: 'learning', icon: 'GraduationCap' }],
  'learning-tasks': [
    ROOT,
    { label: 'Lernen', page: 'learning', icon: 'GraduationCap' },
    { label: 'Aufgaben', page: 'learning-tasks', icon: 'GraduationCap' },
  ],

  // KI & Lernen: Meine KI
  'my-ai': [ROOT, { label: 'Meine KI', page: 'my-ai', icon: 'Brain' }],

  // KI & Lernen: Screen Memory
  'screen-memory': [ROOT, { label: 'Screen Memory', page: 'screen-memory', icon: 'Monitor' }],
  'personalization': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: 'Brain' },
    { label: 'Personalisierung', page: 'personalization', icon: 'Brain' },
  ],
  'voice-chat': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: 'Brain' },
    { label: 'Sprach-Chat', page: 'voice-chat', icon: 'Brain' },
  ],
  'memory-insights': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: 'Brain' },
    { label: 'Memory Insights', page: 'memory-insights', icon: 'Brain' },
  ],

  // Footer: Einstellungen
  'settings': [ROOT, { label: 'Einstellungen', page: 'settings', icon: 'Settings' }],
  'profile': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: 'Settings' },
    { label: 'Profil', page: 'profile', icon: 'Settings' },
  ],
  'automations': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: 'Settings' },
    { label: 'Automationen', page: 'automations', icon: 'Settings' },
  ],
  'integrations': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: 'Settings' },
    { label: 'Integrationen', page: 'integrations', icon: 'Settings' },
  ],
  'export': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: 'Settings' },
    { label: 'Daten', page: 'export', icon: 'Settings' },
  ],
  'sync': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: 'Settings' },
    { label: 'Daten', page: 'sync', icon: 'Settings' },
  ],

  // Footer: Benachrichtigungen
  'notifications': [ROOT, { label: 'Benachrichtigungen', page: 'notifications', icon: 'Bell' }],

  // Legacy/Misc
  'stories': [ROOT, { label: 'Stories', page: 'stories', icon: 'BookOpen' }],

  // System Admin
  'system-admin': [ROOT, { label: 'System', page: 'system-admin', icon: 'Monitor' }],

  // GraphRAG (sub-tab of Insights)
  'graphrag': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: 'BarChart3' },
    { label: 'GraphRAG', page: 'graphrag', icon: 'BarChart3' },
  ],

  // Procedural Memory (sub-tab of Meine KI)
  'procedural-memory': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: 'Brain' },
    { label: 'Prozeduren', page: 'procedural-memory', icon: 'Brain' },
  ],

  // Digital Twin (sub-tab of Meine KI)
  'digital-twin': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: 'Brain' },
    { label: 'Digital Twin', page: 'digital-twin', icon: 'Brain' },
  ],
};

/**
 * Get breadcrumbs for a given page
 */
export function getBreadcrumbs(page: Page): BreadcrumbItem[] {
  return BREADCRUMB_MAP[page] || [{ label: page, page, icon: 'BookOpen' }];
}
