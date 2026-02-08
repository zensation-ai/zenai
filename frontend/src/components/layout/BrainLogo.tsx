/**
 * BrainLogo - Shared SVG brain logo
 *
 * Used in Sidebar header and MobileSidebarDrawer.
 */

import { memo } from 'react';

interface BrainLogoProps {
  size?: number;
  className?: string;
}

export const BrainLogo = memo(function BrainLogo({ size = 32, className }: BrainLogoProps) {
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
        <linearGradient id="brainLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffb347" />
          <stop offset="40%" stopColor="#ff9f33" />
          <stop offset="60%" stopColor="#ff8c00" />
          <stop offset="100%" stopColor="#ff6347" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#1a2634" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <path d="M30 50 C30 40, 33 32, 40 28 C44 26, 47 27, 49 30 C49 35, 47 40, 46 45 C45 50, 47 55, 45 60 C42 66, 38 68, 34 66 C30 63, 30 56, 30 50Z" fill="url(#brainLogoGradient)" />
      <path d="M70 50 C70 40, 67 32, 60 28 C56 26, 53 27, 51 30 C51 35, 53 40, 54 45 C55 50, 53 55, 55 60 C58 66, 62 68, 66 66 C70 63, 70 56, 70 50Z" fill="url(#brainLogoGradient)" />
      <line x1="37" y1="40" x2="50" y2="50" stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="63" y1="40" x2="50" y2="50" stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="50" cy="50" r="4" fill="#ffb347" />
    </svg>
  );
});
