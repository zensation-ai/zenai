/**
 * HubPage - Unified page layout for all tabbed pages
 *
 * Replaces 7+ different tab implementations with a single,
 * consistent component. Provides:
 * - PageHeader with back button
 * - Tab navigation bar (hub-tabs pattern)
 * - Content area
 * - RisingBubbles background
 * - Responsive mobile tabs (icons-only on small screens)
 * - ARIA-compliant tab roles
 * - Optional badge support per tab
 */

import { memo, type ReactNode } from 'react';
import type { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import { RisingBubbles } from './RisingBubbles';
import type { BreadcrumbItem } from './Breadcrumbs';
import type { Page } from '../types';
import './shared-tabs.css';

export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  icon: string;
  badge?: number | string;
  description?: string;
}

interface HubPageProps<T extends string> {
  /** Page title shown in header */
  title: string;
  /** Emoji icon for the header */
  icon: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Tab definitions */
  tabs: readonly TabDef<T>[];
  /** Currently active tab */
  activeTab: T;
  /** Called when a tab is clicked */
  onTabChange: (tab: T) => void;
  /** Back button handler */
  onBack: () => void;
  /** Optional back button label */
  backLabel?: string;
  /** Current AI context for data-context attribute */
  context?: AIContext;
  /** Tab content (rendered inside hub-content) */
  children: ReactNode;
  /** Optional content for the right side of the header */
  headerActions?: ReactNode;
  /** Optional breadcrumbs */
  breadcrumbs?: BreadcrumbItem[];
  /** Navigation handler for breadcrumbs */
  onNavigate?: (page: Page) => void;
  /** Hide the rising bubbles background */
  noBubbles?: boolean;
  /** ARIA label for tab navigation */
  ariaLabel?: string;
}

function HubPageComponent<T extends string>({
  title,
  icon,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  backLabel,
  context,
  children,
  headerActions,
  breadcrumbs,
  onNavigate,
  noBubbles,
  ariaLabel,
}: HubPageProps<T>) {
  return (
    <div className="hub-page" data-context={context}>
      {!noBubbles && <RisingBubbles variant="subtle" />}
      <PageHeader
        title={title}
        icon={icon}
        subtitle={subtitle}
        onBack={onBack}
        backLabel={backLabel}
        breadcrumbs={breadcrumbs}
        onNavigate={onNavigate}
      >
        {headerActions}
      </PageHeader>

      <nav className="hub-tabs" role="tablist" aria-label={ariaLabel || `${title} Navigation`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`hub-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            title={tab.description}
          >
            <span className="hub-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="hub-tab-label">{tab.label}</span>
            {tab.badge != null && (
              <span className="hub-tab-badge" aria-label={`${tab.badge}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="hub-content" role="tabpanel">
        {children}
      </main>
    </div>
  );
}

export const HubPage = memo(HubPageComponent) as typeof HubPageComponent;
