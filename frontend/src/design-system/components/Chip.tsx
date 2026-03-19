import type { HTMLAttributes } from 'react';
import './Chip.css';

export type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  label: string;
  color?: ChipColor;
  selected?: boolean;
  onDismiss?: () => void;
}

export function Chip({
  label,
  color = 'default',
  selected = false,
  onDismiss,
  className,
  ...rest
}: ChipProps) {
  const classes = [
    'ds-chip',
    `ds-chip--${color}`,
    selected ? 'ds-chip--selected' : '',
    onDismiss ? 'ds-chip--dismissible' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      <span className="ds-chip__label">{label}</span>
      {onDismiss && (
        <button
          type="button"
          className="ds-chip__dismiss"
          aria-label={`${label} entfernen`}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M9 3L3 9M3 3l6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
