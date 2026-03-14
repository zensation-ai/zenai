import type { HTMLAttributes, ReactNode } from 'react';
import './Badge.css';

export type BadgeVariant = 'status' | 'context' | 'priority';
export type BadgeSize = 'sm' | 'md';
export type BadgeColor = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  color?: BadgeColor;
  /** Optional dot indicator before label */
  dot?: boolean;
  children: ReactNode;
}

export function Badge({
  variant = 'status',
  size = 'md',
  color = 'neutral',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = [
    'ds-badge',
    `ds-badge--${variant}`,
    `ds-badge--${size}`,
    `ds-badge--${color}`,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {dot && <span className="ds-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
