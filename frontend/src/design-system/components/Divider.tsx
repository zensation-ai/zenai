import type { HTMLAttributes } from 'react';
import './Divider.css';

export type DividerOrientation = 'horizontal' | 'vertical';

export interface DividerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  orientation?: DividerOrientation;
  /** Optional text label centered in the divider */
  label?: string;
}

export function Divider({ orientation = 'horizontal', label, className, ...rest }: DividerProps) {
  const classes = [
    'ds-divider',
    `ds-divider--${orientation}`,
    label ? 'ds-divider--labeled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (label) {
    return (
      <div role="separator" aria-orientation={orientation} className={classes} {...rest}>
        <hr className="ds-divider__line" aria-hidden="true" />
        <span className="ds-divider__label">{label}</span>
        <hr className="ds-divider__line" aria-hidden="true" />
      </div>
    );
  }

  return (
    <hr role="separator" aria-orientation={orientation} className={classes} {...(rest as HTMLAttributes<HTMLHRElement>)} />
  );
}
