import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Page } from '../types';
import { getPageIcon } from '../utils/navIcons';

export interface BreadcrumbItem {
  label: string;
  page: Page;
  icon?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (page: Page) => void;
}

export const Breadcrumbs = memo(function Breadcrumbs({
  items,
  onNavigate,
}: BreadcrumbsProps) {
  if (items.length <= 1) return null;

  return (
    <nav className="mb-2" aria-label="Breadcrumb-Navigation">
      <ol className="flex items-center gap-1.5 list-none m-0 p-0 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const Icon = getPageIcon(item.page);

          return (
            <li key={`${item.page}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight size={14} className="text-text-muted shrink-0" aria-hidden="true" />
              )}
              {isLast ? (
                <span className="flex items-center gap-1.5 text-text font-medium" aria-current="page">
                  <Icon size={14} strokeWidth={1.5} className="text-text-secondary" aria-hidden="true" />
                  <span>{item.label}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-text-muted bg-transparent border-none cursor-pointer p-0 rounded transition-colors duration-150 hover:text-text"
                  onClick={() => onNavigate(item.page)}
                >
                  <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
