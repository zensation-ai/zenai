import { ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';
import type { Page } from '../types';
import '../neurodesign.css';
import './PageHeader.css';

interface PageHeaderProps {
  title: string;
  icon?: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  children?: ReactNode;
  variant?: 'default' | 'compact';
  /** Optional breadcrumb items for navigation context */
  breadcrumbs?: BreadcrumbItem[];
  /** Navigation handler for breadcrumb clicks */
  onNavigate?: (page: Page) => void;
}

/**
 * Consistent Page Header Component
 * Used across all sub-pages for a unified experience
 * Now supports breadcrumb navigation for improved orientation
 */
export function PageHeader({
  title,
  icon,
  subtitle,
  onBack,
  backLabel = 'Zurück',
  children,
  variant = 'default',
  breadcrumbs,
  onNavigate
}: PageHeaderProps) {
  return (
    <>
      {breadcrumbs && breadcrumbs.length > 1 && onNavigate && (
        <Breadcrumbs items={breadcrumbs} onNavigate={onNavigate} />
      )}
      <header className={`page-header liquid-glass-dark page-header-${variant}`}>
        <div className="page-header-content">
          <div className="page-header-left">
            <button
              type="button"
              className="page-back-button neuro-press-effect neuro-focus-ring neuro-anticipate"
              data-anticipate={backLabel}
              onClick={onBack}
              aria-label={backLabel}
            >
              <span className="back-arrow" aria-hidden="true">←</span>
              <span className="back-text">{backLabel}</span>
            </button>
            <div className="page-title-group">
              {icon && <span className="page-icon" aria-hidden="true">{icon}</span>}
              <div className="page-title-content">
                <h1 className="page-title">{title}</h1>
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
              </div>
            </div>
          </div>
          {children && (
            <div className="page-header-right">
              {children}
            </div>
          )}
        </div>
      </header>
    </>
  );
}
