import type { HTMLAttributes } from 'react';
import './Spinner.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends Omit<HTMLAttributes<SVGSVGElement>, 'role'> {
  size?: SpinnerSize;
  /** Accessible label announced to screen readers */
  label?: string;
}

const SIZE_PX: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 36,
};

export function Spinner({ size = 'md', label = 'Laden…', className, ...rest }: SpinnerProps) {
  const px = SIZE_PX[size];
  const classes = ['ds-spinner', `ds-spinner--${size}`, className ?? ''].filter(Boolean).join(' ');

  return (
    <svg
      role="status"
      aria-label={label}
      className={classes}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <circle
        className="ds-spinner__track"
        cx="12"
        cy="12"
        r="10"
        strokeWidth="2.5"
      />
      <circle
        className="ds-spinner__arc"
        cx="12"
        cy="12"
        r="10"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="44 18"
      />
    </svg>
  );
}
