import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

export type CardVariant = 'surface' | 'glass' | 'elevated';
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Enable hover lift effect */
  interactive?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export function Card({
  variant = 'surface',
  padding = 'md',
  interactive = false,
  header,
  footer,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    'ds-card',
    `ds-card--${variant}`,
    `ds-card--pad-${padding}`,
    interactive ? 'ds-card--interactive' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {header && <div className="ds-card__header">{header}</div>}
      <div className="ds-card__body">{children}</div>
      {footer && <div className="ds-card__footer">{footer}</div>}
    </div>
  );
}
