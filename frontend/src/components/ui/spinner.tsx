import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

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

  return (
    <svg
      role="status"
      aria-label={label}
      className={cn('animate-spin text-primary', className)}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <circle
        className="opacity-25 stroke-current"
        cx="12"
        cy="12"
        r="10"
        strokeWidth="2.5"
      />
      <circle
        className="opacity-75 stroke-current"
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
