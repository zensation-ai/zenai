import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  icon?: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  children?: ReactNode;
  variant?: 'default' | 'compact';
}

export function PageHeader({
  title,
  icon,
  subtitle,
  children,
  variant = 'default',
}: PageHeaderProps) {
  return (
    <header className={cn(
      'flex items-center justify-between',
      variant === 'compact' ? 'mb-3 pb-3' : 'mb-5 pb-4',
    )}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span className="text-2xl shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-surface-hover/60" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className={cn(
            'font-semibold text-text m-0 tracking-tight',
            variant === 'compact' ? 'text-lg' : 'text-2xl',
          )}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-text-muted m-0 mt-1 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0">
          {children}
        </div>
      )}
    </header>
  );
}
