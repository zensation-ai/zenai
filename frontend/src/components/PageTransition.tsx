import { ReactNode, useEffect, useState, useRef, memo } from 'react';
import './PageTransition.css';

interface PageTransitionProps {
  /** Unique key to identify the current page */
  pageKey: string;
  /** Content to render with transition */
  children: ReactNode;
  /** Transition type */
  type?: 'fade' | 'slide' | 'scale';
  /** Duration in ms */
  duration?: number;
}

/**
 * Page Transition Wrapper
 * Provides smooth animations when navigating between pages
 */
export const PageTransition = memo(function PageTransition({
  pageKey,
  children,
  type = 'fade',
  duration = 200,
}: PageTransitionProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayContent, setDisplayContent] = useState(children);
  const prevKeyRef = useRef(pageKey);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Only animate when page key actually changes
    if (prevKeyRef.current !== pageKey) {
      setIsAnimating(true);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // After exit animation, update content and start enter
      timeoutRef.current = setTimeout(() => {
        setDisplayContent(children);
        setIsAnimating(false);
        prevKeyRef.current = pageKey;
      }, duration / 2);
    } else {
      // Same page, just update content
      setDisplayContent(children);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pageKey, children, duration]);

  return (
    <div
      className={`page-transition page-transition-${type} ${isAnimating ? 'exiting' : 'entered'}`}
      style={{ '--transition-duration': `${duration}ms` } as React.CSSProperties}
    >
      {displayContent}
    </div>
  );
});

/**
 * Simpler fade-only transition for content areas
 */
export const FadeTransition = memo(function FadeTransition({
  children,
  show = true,
  duration = 150,
}: {
  children: ReactNode;
  show?: boolean;
  duration?: number;
}) {
  const [shouldRender, setShouldRender] = useState(show);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fade-transition ${show ? 'visible' : 'hidden'}`}
      style={{ '--fade-duration': `${duration}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
});
