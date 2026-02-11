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

  // Main pages
  'ideas': [ROOT, { label: 'Gedanken', page: 'ideas', icon: '💭' }],

  // Insights hierarchy
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

  // AI Workshop hierarchy
  'ai-workshop': [ROOT, { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' }],
  'incubator': [
    ROOT,
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Inkubator', page: 'incubator', icon: '🧫' },
  ],
  'proactive': [
    ROOT,
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
    { label: 'Vorschläge', page: 'proactive', icon: '💡' },
  ],
  'evolution': [
    ROOT,
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
    { label: 'Entwicklung', page: 'evolution', icon: '🚀' },
  ],

  // Settings
  'settings': [ROOT, { label: 'Einstellungen', page: 'settings', icon: '⚙️' }],

  // Footer items (standalone, not under Settings)
  'profile': [ROOT, { label: 'Profil', page: 'profile', icon: '👤' }],
  'notifications': [ROOT, { label: 'Benachrichtigungen', page: 'notifications', icon: '🔔' }],

  // System section
  'automations': [ROOT, { label: 'Automationen', page: 'automations', icon: '⚡' }],
  'integrations': [ROOT, { label: 'Integrationen', page: 'integrations', icon: '🔗' }],
  'export': [ROOT, { label: 'Export', page: 'export', icon: '📤' }],
  'sync': [ROOT, { label: 'Synchronisierung', page: 'sync', icon: '🔄' }],

  // Learning hierarchy
  'learning': [ROOT, { label: 'Lernen', page: 'learning', icon: '📚' }],
  'learning-tasks': [
    ROOT,
    { label: 'Lernen', page: 'learning', icon: '📚' },
    { label: 'Aufgaben', page: 'learning-tasks', icon: '✅' },
  ],

  // Standalone pages
  'triage': [ROOT, { label: 'Sortieren', page: 'triage', icon: '📋' }],
  'meetings': [ROOT, { label: 'Meetings', page: 'meetings', icon: '📅' }],
  'personalization': [ROOT, { label: 'Personalisierung', page: 'personalization', icon: '🎨' }],
  'documents': [ROOT, { label: 'Dokumente', page: 'documents', icon: '📄' }],
  'media': [ROOT, { label: 'Medien', page: 'media', icon: '🖼️' }],
  'stories': [ROOT, { label: 'Stories', page: 'stories', icon: '📖' }],
  'archive': [ROOT, { label: 'Archiv', page: 'archive', icon: '📥' }],
  'canvas': [ROOT, { label: 'Dokumente', page: 'documents', icon: '📄' }, { label: 'Canvas', page: 'canvas', icon: '🎨' }],
  'my-ai': [
    ROOT,
    { label: 'KI-Assistenz', page: 'ai-workshop', icon: '🧠' },
    { label: 'Meine KI', page: 'my-ai', icon: '🤖' },
  ],
  'voice-chat': [
    ROOT,
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
    { label: 'Sprachkonversation', page: 'voice-chat', icon: '🎙️' },
  ],
  'agent-teams': [
    ROOT,
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
    { label: 'Agent Teams', page: 'agent-teams', icon: '🤖' },
  ],
  'business': [
    ROOT,
    { label: 'Business Manager', page: 'business', icon: '💼' },
  ],
};

/**
 * Get breadcrumbs for a given page
 */
export function getBreadcrumbs(page: Page): BreadcrumbItem[] {
  return BREADCRUMB_MAP[page] || [{ label: page, page, icon: '📄' }];
}
