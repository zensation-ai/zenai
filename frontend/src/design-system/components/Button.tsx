import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    disabled,
    className,
    children,
    ...rest
  },
  ref
) {
  const classes = [
    'ds-button',
    `ds-button--${variant}`,
    `ds-button--${size}`,
    loading ? 'ds-button--loading' : '',
    icon && !children ? 'ds-button--icon-only' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span className="ds-button__spinner" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" strokeWidth="2" stroke="currentColor" opacity="0.25" />
            <path
              d="M10 2a8 8 0 0 1 8 8"
              strokeWidth="2"
              stroke="currentColor"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      {icon && <span className="ds-button__icon" aria-hidden="true">{icon}</span>}
      {children && <span className="ds-button__label">{children}</span>}
    </button>
  );
});
