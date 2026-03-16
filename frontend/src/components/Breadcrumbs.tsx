import { memo } from 'react';
import type { Page } from '../types';
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
                  {item.icon && <span className="breadcrumb-icon" aria-hidden="true">{item.icon}</span>}
                  <span className="breadcrumb-label">{item.label}</span>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className="breadcrumb-link neuro-hover-lift"
                    onClick={() => onNavigate(item.page)}
                  >
                    {item.icon && <span className="breadcrumb-icon" aria-hidden="true">{item.icon}</span>}
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
const ROOT: BreadcrumbItem = { label: 'Dashboard', page: 'home', icon: '🏠' };

export const BREADCRUMB_MAP: Record<Page, BreadcrumbItem[]> = {
  // Dashboard root
  'home': [ROOT],

  // Chat
  'chat': [ROOT, { label: 'Chat', page: 'chat', icon: '💬' }],

  // Browser
  'browser': [ROOT, { label: 'Browser', page: 'browser', icon: '🌐' }],

  // Kontakte
  'contacts': [ROOT, { label: 'Kontakte', page: 'contacts', icon: '👥' }],

  // Finanzen
  'finance': [ROOT, { label: 'Finanzen', page: 'finance', icon: '💰' }],

  // Ideen: Gedanken
  'ideas': [ROOT, { label: 'Gedanken', page: 'ideas', icon: '💭' }],
  'incubator': [
    ROOT,
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Inkubator', page: 'incubator', icon: '🧫' },
  ],
  'archive': [
    ROOT,
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Archiv', page: 'archive', icon: '📥' },
  ],
  'triage': [
    ROOT,
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Sortieren', page: 'triage', icon: '📋' },
  ],

  // Ideen: Werkstatt
  'workshop': [ROOT, { label: 'Werkstatt', page: 'workshop', icon: '🧪' }],
  'ai-workshop': [ROOT, { label: 'Werkstatt', page: 'workshop', icon: '🧪' }],
  'proactive': [
    ROOT,
    { label: 'Werkstatt', page: 'workshop', icon: '🧪' },
    { label: 'Vorschläge', page: 'proactive', icon: '✨' },
  ],
  'evolution': [
    ROOT,
    { label: 'Werkstatt', page: 'workshop', icon: '🧪' },
    { label: 'Entwicklung', page: 'evolution', icon: '🌱' },
  ],
  'agent-teams': [
    ROOT,
    { label: 'Werkstatt', page: 'workshop', icon: '🧪' },
    { label: 'Agenten', page: 'agent-teams', icon: '👥' },
  ],
  'mcp-servers': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'MCP Server', page: 'mcp-servers', icon: '🔌' },
  ],

  // Auswerten: Insights
  'insights': [ROOT, { label: 'Insights', page: 'insights', icon: '📊' }],
  'dashboard': [ROOT, { label: 'Insights', page: 'insights', icon: '📊' }],
  'analytics': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'Statistiken', page: 'analytics', icon: '📈' },
  ],
  'digest': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'Zusammenfassung', page: 'digest', icon: '📋' },
  ],
  'knowledge-graph': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'Verbindungen', page: 'knowledge-graph', icon: '🕸️' },
  ],

  // Organisieren: E-Mail
  'email': [ROOT, { label: 'E-Mail', page: 'email', icon: '✉️' }],

  // Organisieren: Wissensbasis
  'documents': [ROOT, { label: 'Wissensbasis', page: 'documents', icon: '📚' }],
  'canvas': [
    ROOT,
    { label: 'Wissensbasis', page: 'documents', icon: '📚' },
    { label: 'Editor', page: 'canvas', icon: '✏️' },
  ],
  'media': [
    ROOT,
    { label: 'Wissensbasis', page: 'documents', icon: '📚' },
    { label: 'Medien', page: 'media', icon: '🖼️' },
  ],
  'meetings': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: '📋' },
    { label: 'Meetings', page: 'meetings', icon: '📅' },
  ],

  // Organisieren: Planer
  'calendar': [ROOT, { label: 'Planer', page: 'calendar', icon: '📋' }],
  'tasks': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: '📋' },
    { label: 'Aufgaben', page: 'tasks', icon: '✅' },
  ],
  'kanban': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: '📋' },
    { label: 'Kanban', page: 'kanban', icon: '📊' },
  ],
  'gantt': [
    ROOT,
    { label: 'Planer', page: 'calendar', icon: '📋' },
    { label: 'Gantt', page: 'gantt', icon: '📈' },
  ],

  // Auswerten: Business
  'business': [ROOT, { label: 'Business', page: 'business', icon: '💼' }],

  // KI & Lernen: Lernen
  'learning': [ROOT, { label: 'Lernen', page: 'learning', icon: '📖' }],
  'learning-tasks': [
    ROOT,
    { label: 'Lernen', page: 'learning', icon: '📖' },
    { label: 'Aufgaben', page: 'learning-tasks', icon: '✅' },
  ],

  // KI & Lernen: Meine KI
  'my-ai': [ROOT, { label: 'Meine KI', page: 'my-ai', icon: '🤖' }],

  // KI & Lernen: Screen Memory
  'screen-memory': [ROOT, { label: 'Screen Memory', page: 'screen-memory', icon: '🧠' }],
  'personalization': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: '🤖' },
    { label: 'Personalisierung', page: 'personalization', icon: '🎨' },
  ],
  'voice-chat': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: '🤖' },
    { label: 'Sprach-Chat', page: 'voice-chat', icon: '🎙️' },
  ],
  'memory-insights': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: '🤖' },
    { label: 'Memory Insights', page: 'memory-insights', icon: '🧠' },
  ],

  // Footer: Einstellungen
  'settings': [ROOT, { label: 'Einstellungen', page: 'settings', icon: '⚙️' }],
  'profile': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Profil', page: 'profile', icon: '👤' },
  ],
  'automations': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Automationen', page: 'automations', icon: '⚡' },
  ],
  'integrations': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Integrationen', page: 'integrations', icon: '🔗' },
  ],
  'export': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Daten', page: 'export', icon: '📦' },
  ],
  'sync': [
    ROOT,
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Daten', page: 'sync', icon: '📦' },
  ],

  // Footer: Benachrichtigungen
  'notifications': [ROOT, { label: 'Benachrichtigungen', page: 'notifications', icon: '🔔' }],

  // Legacy/Misc
  'stories': [ROOT, { label: 'Stories', page: 'stories', icon: '📖' }],

  // System Admin
  'system-admin': [ROOT, { label: 'System', page: 'system-admin', icon: '🖥️' }],

  // GraphRAG (sub-tab of Insights)
  'graphrag': [
    ROOT,
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'GraphRAG', page: 'graphrag', icon: '🔬' },
  ],

  // Procedural Memory (sub-tab of Meine KI)
  'procedural-memory': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: '🤖' },
    { label: 'Prozeduren', page: 'procedural-memory', icon: '📋' },
  ],

  // Digital Twin (sub-tab of Meine KI)
  'digital-twin': [
    ROOT,
    { label: 'Meine KI', page: 'my-ai', icon: '🤖' },
    { label: 'Digital Twin', page: 'digital-twin', icon: '🪞' },
  ],
};

/**
 * Get breadcrumbs for a given page
 */
export function getBreadcrumbs(page: Page): BreadcrumbItem[] {
  return BREADCRUMB_MAP[page] || [{ label: page, page, icon: '📄' }];
}
