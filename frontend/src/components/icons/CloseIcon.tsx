/**
 * CloseIcon - Consistent SVG close/dismiss icon
 *
 * Replaces Unicode ✕ (\u2715) which renders inconsistently across platforms.
 */

interface CloseIconProps {
  size?: number;
  className?: string;
}

export function CloseIcon({ size = 18, className }: CloseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M13.5 4.5L4.5 13.5M4.5 4.5l9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
