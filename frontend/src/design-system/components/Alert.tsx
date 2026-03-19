import type { ReactNode } from 'react';
import './Alert.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  variant: AlertVariant;
  title?: string;
  onDismiss?: () => void;
  children: ReactNode;
  className?: string;
}

export function Alert({ variant, title, onDismiss, children, className }: AlertProps) {
  const classes = ['ds-alert', `ds-alert--${variant}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div role="alert" className={classes}>
      <div className="ds-alert__icon" aria-hidden="true">
        {variant === 'info' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        {variant === 'success' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {variant === 'warning' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        {variant === 'danger' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="ds-alert__content">
        {title && <div className="ds-alert__title">{title}</div>}
        <div className="ds-alert__body">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="ds-alert__dismiss"
          onClick={onDismiss}
          aria-label="Schließen"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M12 2L2 12M2 2l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
