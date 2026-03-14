import type { ReactNode } from 'react';
import './EmptyState.css';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const classes = ['ds-empty-state', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {icon && <div className="ds-empty-state__icon" aria-hidden="true">{icon}</div>}
      <h3 className="ds-empty-state__title">{title}</h3>
      {description && <p className="ds-empty-state__description">{description}</p>}
      {action && <div className="ds-empty-state__action">{action}</div>}
    </div>
  );
}
