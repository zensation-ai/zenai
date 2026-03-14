import type { CSSProperties } from 'react';
import './Skeleton.css';

export type SkeletonVariant = 'text' | 'circle' | 'rectangle' | 'card';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  /** Number of lines for text variant */
  count?: number;
  className?: string;
}

export function Skeleton({
  variant = 'rectangle',
  width,
  height,
  count = 1,
  className,
}: SkeletonProps) {
  const classes = ['ds-skeleton', `ds-skeleton--${variant}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  if (variant === 'text') {
    return (
      <div
        className="ds-skeleton__text-group"
        role="status"
        aria-busy="true"
        aria-label="Laden..."
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="ds-skeleton ds-skeleton--text"
            style={{ width: width ?? `${Math.max(40, 95 - i * 15)}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  if (variant === 'circle') {
    const size = width ?? height ?? 48;
    const style: CSSProperties = {
      width: typeof size === 'number' ? `${size}px` : size,
      height: typeof size === 'number' ? `${size}px` : size,
    };
    return (
      <div
        className={classes}
        style={style}
        role="status"
        aria-busy="true"
        aria-label="Laden..."
      />
    );
  }

  if (variant === 'card') {
    return (
      <div className={classes} role="status" aria-busy="true" aria-label="Laden...">
        <div className="ds-skeleton__card-image" aria-hidden="true" />
        <div className="ds-skeleton__card-lines" aria-hidden="true">
          <div className="ds-skeleton ds-skeleton--text" style={{ width: '70%' }} />
          <div className="ds-skeleton ds-skeleton--text" style={{ width: '100%' }} />
          <div className="ds-skeleton ds-skeleton--text" style={{ width: '55%' }} />
        </div>
      </div>
    );
  }

  // Rectangle (default)
  const style: CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={classes}
      style={style}
      role="status"
      aria-busy="true"
      aria-label="Laden..."
    />
  );
}
