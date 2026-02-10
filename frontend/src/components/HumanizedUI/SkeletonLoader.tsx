import { useState, useEffect, type CSSProperties } from 'react';

export interface SkeletonLoaderProps {
  /** Content type */
  type: 'text' | 'heading' | 'card' | 'avatar' | 'button' | 'paragraph';
  /** Number of lines/items */
  count?: number;
  /** Width */
  width?: string | number;
  /** Height */
  height?: string | number;
  /** Aria-Label for screenreaders */
  ariaLabel?: string;
}

export const SkeletonLoader = ({
  type,
  count = 1,
  width,
  height,
  ariaLabel = 'Laedt...',
}: SkeletonLoaderProps) => {
  const [animating, setAnimating] = useState(true);

  // WCAG 2.2.2: Animation stops after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimating(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const getDefaultStyle = (): CSSProperties => {
    const styles: Record<string, CSSProperties> = {
      text: { width: width || '100%', height: height || '16px' },
      heading: { width: width || '60%', height: height || '24px' },
      card: { width: width || '100%', height: height || '120px' },
      avatar: { width: width || '48px', height: height || '48px', borderRadius: '50%' },
      button: { width: width || '100px', height: height || '40px', borderRadius: '8px' },
      paragraph: { width: width || '100%', height: height || '80px' },
    };
    return styles[type] || styles.text;
  };

  const renderSkeletonItem = (index: number) => (
    <div
      key={`skeleton-${type}-${index}`}
      className={`skeleton-item ${type} ${animating ? 'animating' : ''}`}
      style={getDefaultStyle()}
      aria-hidden="true"
    />
  );

  return (
    <div
      className="skeleton-loader"
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    >
      <span className="sr-only">{ariaLabel}</span>
      {type === 'paragraph' ? (
        <div className="skeleton-paragraph">
          <div className="skeleton-item text animating" style={{ width: '100%' }} />
          <div className="skeleton-item text animating" style={{ width: '100%' }} />
          <div className="skeleton-item text animating" style={{ width: '80%' }} />
        </div>
      ) : (
        Array.from({ length: count }).map((_, i) => renderSkeletonItem(i))
      )}
    </div>
  );
};
