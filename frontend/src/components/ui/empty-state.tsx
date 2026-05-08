import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 px-6 text-center', className)}>
      {icon && (
        <div className="mb-5 flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-hover/60 text-3xl text-text-muted" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-text mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
