/**
 * Icon - Standardized lucide-react icon wrapper
 *
 * Normalizes icon size, color, and strokeWidth across the entire UI.
 * Prevents inconsistency by enforcing a small set of sizes.
 */

import type { LucideIcon, LucideProps } from 'lucide-react';
import { memo } from 'react';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<IconSize, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

interface IconProps extends Omit<LucideProps, 'size'> {
  /** The lucide-react icon component */
  icon: LucideIcon;
  /** Standardized size preset */
  size?: IconSize;
  /** Override stroke width (default: 1.5) */
  strokeWidth?: number;
}

export const Icon = memo<IconProps>(function Icon({
  icon: IconComponent,
  size = 'md',
  strokeWidth = 1.5,
  className,
  ...rest
}) {
  return (
    <IconComponent
      size={SIZE_MAP[size]}
      strokeWidth={strokeWidth}
      className={className}
      {...rest}
    />
  );
});

export default Icon;
