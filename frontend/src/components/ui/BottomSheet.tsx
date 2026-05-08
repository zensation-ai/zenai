/**
 * Phase 85: BottomSheet Component
 *
 * Mobile-native bottom sheet pattern with:
 * - Spring animation slide-up
 * - Swipe-down-to-close via touch events
 * - Backdrop overlay with tap-to-close
 * - Three snap points: peek (30%), half (50%), full (90%)
 * - Drag handle indicator
 * - GPU-composited CSS transform animations
 * - Scrollable content when fully open
 */

import { useRef, useEffect, useCallback, useState, type ReactNode, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export type SnapPoint = 'peek' | 'half' | 'full';

const SNAP_HEIGHTS: Record<SnapPoint, number> = {
  peek: 30,
  half: 50,
  full: 90,
};

/** Velocity threshold (px/ms) to trigger close on swipe */
const VELOCITY_THRESHOLD = 0.5;
/** Distance threshold (% of sheet height) to snap down or close */
const DISTANCE_THRESHOLD = 0.3;

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  snapPoint?: SnapPoint;
  children: ReactNode;
  /** Optional title shown in the header */
  title?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  snapPoint = 'half',
  children,
  title,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentTranslateY, setCurrentTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Touch tracking refs (avoid re-renders during drag)
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const lastTouchY = useRef(0);

  const sheetHeight = SNAP_HEIGHTS[snapPoint];

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    // Wait for exit animation
    setTimeout(() => {
      setIsClosing(false);
      setCurrentTranslateY(0);
      onClose();
    }, 250);
  }, [onClose]);

  // Touch handlers for swipe-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartTime.current = Date.now();
    lastTouchY.current = touch.clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;
    lastTouchY.current = touch.clientY;

    // Only allow downward drag (positive deltaY)
    if (deltaY > 0) {
      // If content is scrollable and scrolled down, don't drag
      if (contentRef.current && contentRef.current.scrollTop > 0) {
        return;
      }
      setCurrentTranslateY(deltaY);
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const elapsed = Date.now() - touchStartTime.current;
    const velocity = currentTranslateY / elapsed;

    // Close if fast swipe or dragged past threshold
    const sheetPx = (window.innerHeight * sheetHeight) / 100;
    if (velocity > VELOCITY_THRESHOLD || currentTranslateY > sheetPx * DISTANCE_THRESHOLD) {
      handleClose();
    } else {
      // Snap back
      setCurrentTranslateY(0);
    }
  }, [isDragging, currentTranslateY, sheetHeight, handleClose]);

  if (!isOpen && !isClosing) return null;

  const translateY = isClosing ? '100%' : `${currentTranslateY}px`;

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/40',
          isClosing ? 'animate-bs-backdrop-out' : 'animate-bs-backdrop-in',
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'relative w-full max-w-[600px] bg-surface rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden will-change-transform [height:var(--h)] [transform:var(--tf)]',
          isClosing ? 'animate-bs-slide-down' : 'animate-bs-slide-up',
        )}
        style={{
          '--h': `${sheetHeight}vh`,
          '--tf': `translateY(${translateY})`,
          transition: isDragging ? 'none' : undefined,
        } as CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-2.5 pb-1.5 cursor-grab" aria-hidden="true">
          <div className="w-9 h-1 rounded-sm bg-border" />
        </div>

        {/* Optional Title */}
        {title && (
          <div className="px-4 pb-2 border-b border-border">
            <h2 className="text-base font-semibold m-0">{title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]" ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
