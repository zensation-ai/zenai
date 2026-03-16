import { useShowDelay } from '../hooks/useShowDelay';

interface DelayedSpinnerProps {
  /** Whether the operation is loading */
  isLoading: boolean;
  /** Delay before showing spinner (ms, default 150) */
  showAfterMs?: number;
  /** Minimum display time once visible (ms, default 300) */
  minDisplayMs?: number;
  /** Optional label shown alongside the spinner */
  label?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * DelayedSpinner — A loading spinner that only appears after a brief delay.
 *
 * Prevents the "flash of spinner" for fast operations (< 150ms).
 * Once visible, stays for at least 300ms to avoid jarring appearance.
 */
export function DelayedSpinner({
  isLoading,
  showAfterMs = 150,
  minDisplayMs = 300,
  label,
  size = 'md',
}: DelayedSpinnerProps) {
  const showSpinner = useShowDelay(isLoading, showAfterMs, minDisplayMs);

  if (!showSpinner) return null;

  const sizeMap = { sm: 16, md: 24, lg: 40 };
  const dimension = sizeMap[size];

  return (
    <div
      className="delayed-spinner"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '16px',
      }}
    >
      <svg
        width={dimension}
        height={dimension}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'spin 1s linear infinite' }}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.25"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <span style={{ fontSize: size === 'sm' ? '12px' : size === 'lg' ? '16px' : '14px' }}>
          {label}
        </span>
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
