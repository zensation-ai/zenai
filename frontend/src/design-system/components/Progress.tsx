import type { HTMLAttributes } from 'react';
import './Progress.css';

export type ProgressColor = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  /** Current value (0–100). Omit for indeterminate. */
  value?: number;
  /** Optional label displayed above or below the bar */
  label?: string;
  color?: ProgressColor;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function Progress({ value, label, color = 'default', className, ...rest }: ProgressProps) {
  const isIndeterminate = value === undefined;
  const clamped = isIndeterminate ? undefined : clamp(value!);

  const classes = [
    'ds-progress',
    `ds-progress--${color}`,
    isIndeterminate ? 'ds-progress--indeterminate' : 'ds-progress--determinate',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const ariaProps = isIndeterminate
    ? { 'aria-valuemin': 0 as number | undefined, 'aria-valuemax': 100 as number | undefined }
    : {
        'aria-valuenow': clamped,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      };

  return (
    <div className="ds-progress__wrapper">
      {label && <span className="ds-progress__label">{label}</span>}
      <div role="progressbar" className={classes} {...ariaProps} {...rest}>
        <div
          className="ds-progress__fill"
          style={isIndeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
