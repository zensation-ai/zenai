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
export const BREADCRUMB_MAP: Record<Page, BreadcrumbItem[]> = {
  // Root level pages - no breadcrumbs needed
  'ideas': [{ label: 'Gedanken', page: 'ideas', icon: '💭' }],

  // Insights hierarchy
  'insights': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Insights', page: 'insights', icon: '📊' },
  ],
  'dashboard': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'Dashboard', page: 'dashboard', icon: '🏠' },
  ],
  'analytics': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'Statistiken', page: 'analytics', icon: '📈' },
  ],
  'digest': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'Zusammenfassung', page: 'digest', icon: '📋' },
  ],
  'knowledge-graph': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Insights', page: 'insights', icon: '📊' },
    { label: 'Verbindungen', page: 'knowledge-graph', icon: '🕸️' },
  ],

  // AI Workshop hierarchy
  'ai-workshop': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
  ],
  'incubator': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
    { label: 'Inkubator', page: 'incubator', icon: '🌱' },
  ],
  'proactive': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
    { label: 'Vorschläge', page: 'proactive', icon: '💡' },
  ],
  'evolution': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'KI-Werkstatt', page: 'ai-workshop', icon: '🧠' },
    { label: 'Entwicklung', page: 'evolution', icon: '🚀' },
  ],

  // Settings hierarchy
  'settings': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
  ],
  'profile': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Profil', page: 'profile', icon: '👤' },
  ],
  'integrations': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Integrationen', page: 'integrations', icon: '🔗' },
  ],
  'automations': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Automationen', page: 'automations', icon: '⚡' },
  ],
  'notifications': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Benachrichtigungen', page: 'notifications', icon: '🔔' },
  ],
  'export': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Export', page: 'export', icon: '📤' },
  ],
  'sync': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Einstellungen', page: 'settings', icon: '⚙️' },
    { label: 'Synchronisierung', page: 'sync', icon: '🔄' },
  ],

  // Learning hierarchy
  'learning': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Lernen', page: 'learning', icon: '📚' },
  ],
  'learning-tasks': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Lernen', page: 'learning', icon: '📚' },
    { label: 'Aufgaben', page: 'learning-tasks', icon: '✅' },
  ],

  // Standalone pages
  'triage': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Sortieren', page: 'triage', icon: '📋' },
  ],
  'meetings': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Meetings', page: 'meetings', icon: '📅' },
  ],
  'personalization': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Personalisierung', page: 'personalization', icon: '🎨' },
  ],
  'documents': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Dokument-Analyse', page: 'documents', icon: '📑' },
  ],
  'media': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Medien', page: 'media', icon: '🖼️' },
  ],
  'stories': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Stories', page: 'stories', icon: '📖' },
  ],
  'archive': [
    { label: 'Gedanken', page: 'ideas', icon: '💭' },
    { label: 'Archiv', page: 'archive', icon: '📥' },
  ],
};

/**
 * Get breadcrumbs for a given page
 */
export function getBreadcrumbs(page: Page): BreadcrumbItem[] {
  return BREADCRUMB_MAP[page] || [{ label: page, page, icon: '📄' }];
}
