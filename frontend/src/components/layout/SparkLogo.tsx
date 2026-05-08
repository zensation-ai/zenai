/**
 * SparkLogo — Zensation brand logo (Spark/Funke)
 *
 * Three petrol lines converge to an orange energy center.
 * Uses useId() for unique gradient IDs to avoid SVG collisions.
 */
import { memo, useId } from 'react';

interface SparkLogoProps {
  size?: number;
  variant?: 'dark' | 'light';
  animated?: boolean;
  className?: string;
}

export const SparkLogo = memo(function SparkLogo({
  size = 32,
  variant = 'dark',
  animated = false,
  className,
}: SparkLogoProps) {
  const uid = useId();
  const nodeGradId = `nodeGrad${uid}`;
  const centerGradId = `centerGrad${uid}`;

  const isDark = variant === 'dark';

  const glow = isDark
    ? { outer: 0.13, mid: 0.15, inner: 0.21 }
    : { outer: 0.04, mid: 0.06, inner: 0.16 };

  const orbitStroke = isDark ? '#1a6b7a' : '#144A56';
  const orbitOpacity = isDark ? 0.38 : 0.14;
  const highlightOpacity = isDark ? 0.35 : 0.3;

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={nodeGradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#1d6474" />
          <stop offset="100%" stopColor="#0f3c48" />
        </radialGradient>
        <radialGradient id={centerGradId} cx="38%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f47a3a" />
          <stop offset="100%" stopColor="#d4511a" />
        </radialGradient>
      </defs>

      {/* Orbit ring */}
      <circle cx="50" cy="48" r="42" fill="none" stroke={orbitStroke} strokeWidth="1.5" opacity={orbitOpacity} />

      {/* Energy glow — stacked rings */}
      <circle cx="50" cy="48" r="26" fill="#EA6022" opacity={glow.outer}>
        {animated && (
          <animate attributeName="r" values="24;28;24" dur="4s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        )}
      </circle>
      <circle cx="50" cy="48" r="20" fill="#EA6022" opacity={glow.mid}>
        {animated && (
          <animate attributeName="r" values="18;22;18" dur="4s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        )}
      </circle>
      <circle cx="50" cy="48" r="15" fill="#EA6022" opacity={glow.inner}>
        {animated && (
          <animate attributeName="r" values="14;17;14" dur="4s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        )}
      </circle>

      {/* Three converging lines */}
      <line x1="50" y1="11.5" x2="50" y2="38.5" stroke="#144A56" strokeWidth="3" strokeLinecap="round" />
      <line x1="17.7" y1="66.8" x2="41.5" y2="53.2" stroke="#144A56" strokeWidth="3" strokeLinecap="round" />
      <line x1="82.3" y1="66.8" x2="58.5" y2="53.2" stroke="#144A56" strokeWidth="3" strokeLinecap="round" />

      {/* Outer nodes (120° equidistant) */}
      <circle cx="50" cy="6" r="5.5" fill={`url(#${nodeGradId})`} />
      <circle cx="13.6" cy="69" r="5.5" fill={`url(#${nodeGradId})`} />
      <circle cx="86.4" cy="69" r="5.5" fill={`url(#${nodeGradId})`} />

      {/* Center energy node */}
      <circle cx="50" cy="48" r="9.5" fill={`url(#${centerGradId})`}>
        {animated && (
          <animate attributeName="r" values="9.5;10.5;9.5" dur="4s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        )}
      </circle>
      <circle cx="50" cy="48" r="3.5" fill="white" opacity={highlightOpacity}>
        {animated && (
          <animate attributeName="opacity" values="0.35;0.2;0.35" dur="4s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        )}
      </circle>
    </svg>
  );
});
