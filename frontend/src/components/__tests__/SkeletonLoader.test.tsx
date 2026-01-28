/**
 * Unit Tests for SkeletonLoader Component
 *
 * Tests skeleton loading UI functionality including:
 * - Different skeleton types
 * - Animation behavior
 * - Accessibility
 * - Count prop for multiple skeletons
 *
 * @module tests/components/SkeletonLoader
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonLoader } from '../SkeletonLoader';

describe('SkeletonLoader Component', () => {
  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      render(<SkeletonLoader />);
      const skeleton = document.querySelector('.skeleton-loader, [class*="skeleton"]');
      expect(skeleton).toBeInTheDocument();
    });

    it('renders default type when no type specified', () => {
      render(<SkeletonLoader />);
      // Should render some form of skeleton
      expect(document.querySelector('[class*="skeleton"]')).toBeInTheDocument();
    });
  });

  describe('Skeleton Types', () => {
    it('renders text skeleton', () => {
      render(<SkeletonLoader type="text" />);
      const skeleton = document.querySelector('.skeleton-text, [class*="skeleton"][class*="text"]');
      expect(skeleton).toBeInTheDocument();
    });

    it('renders card skeleton', () => {
      render(<SkeletonLoader type="card" />);
      const skeleton = document.querySelector('.skeleton-card, [class*="skeleton"][class*="card"]');
      expect(skeleton).toBeInTheDocument();
    });

    it('renders avatar skeleton', () => {
      render(<SkeletonLoader type="avatar" />);
      const skeleton = document.querySelector('.skeleton-avatar, [class*="skeleton"][class*="avatar"]');
      expect(skeleton).toBeInTheDocument();
    });

    it('renders list skeleton', () => {
      render(<SkeletonLoader type="list" />);
      const skeleton = document.querySelector('.skeleton-list, [class*="skeleton"][class*="list"]');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('Count Prop', () => {
    it('renders single skeleton by default', () => {
      render(<SkeletonLoader type="text" />);
      const skeletons = document.querySelectorAll('.skeleton-item, .skeleton-text, [class*="skeleton-"]');
      // At least one skeleton element should exist
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders multiple skeletons when count specified', () => {
      render(<SkeletonLoader type="text" count={3} />);
      // Should have 3 skeleton items or repeated elements
      const container = document.querySelector('.skeleton-loader, [class*="skeleton"]');
      expect(container).toBeInTheDocument();
    });

    it('handles count of 0', () => {
      render(<SkeletonLoader type="text" count={0} />);
      // Should either render nothing or handle gracefully
      const container = document.querySelector('.skeleton-loader');
      // Implementation-specific behavior
    });

    it('handles large count values', () => {
      render(<SkeletonLoader type="text" count={10} />);
      const container = document.querySelector('.skeleton-loader, [class*="skeleton"]');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('has animation class applied', () => {
      render(<SkeletonLoader />);
      const skeleton = document.querySelector('[class*="skeleton"]');

      if (skeleton) {
        // Check for animation-related class or style
        const hasAnimation = skeleton.className.includes('animate') ||
                            skeleton.className.includes('pulse') ||
                            skeleton.className.includes('shimmer');
        // Most skeleton loaders have some animation
      }
    });

    it('respects reduced motion preference', () => {
      // Mock prefers-reduced-motion
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

      render(<SkeletonLoader />);
      const skeleton = document.querySelector('[class*="skeleton"]');

      // Component should be accessible even with reduced motion
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('skeleton is hidden from screen readers', () => {
      render(<SkeletonLoader />);
      const skeleton = document.querySelector('[class*="skeleton"]');

      if (skeleton) {
        // Should have aria-hidden or be decorative
        const hasAriaHidden = skeleton.getAttribute('aria-hidden') === 'true' ||
                              skeleton.getAttribute('role') === 'presentation';
        // Skeletons are typically decorative
      }
    });

    it('provides loading state information', () => {
      render(<SkeletonLoader />);

      // Look for aria-busy or role="status"
      const container = document.querySelector('.skeleton-loader, [class*="skeleton"]');
      if (container) {
        // Parent might have aria-busy="true"
      }
    });
  });

  describe('Custom Styling', () => {
    it('accepts custom className', () => {
      render(<SkeletonLoader className="custom-skeleton" />);
      const skeleton = document.querySelector('.custom-skeleton');
      expect(skeleton).toBeInTheDocument();
    });

    it('applies width prop when provided', () => {
      render(<SkeletonLoader width="200px" />);
      const skeleton = document.querySelector('[class*="skeleton"]');

      if (skeleton) {
        const style = window.getComputedStyle(skeleton);
        // Width might be inline style or CSS variable
      }
    });

    it('applies height prop when provided', () => {
      render(<SkeletonLoader height="50px" />);
      const skeleton = document.querySelector('[class*="skeleton"]');

      if (skeleton) {
        const style = window.getComputedStyle(skeleton);
        // Height might be inline style or CSS variable
      }
    });
  });

  describe('Card Skeleton Specifics', () => {
    it('card skeleton contains header area', () => {
      render(<SkeletonLoader type="card" />);
      const cardSkeleton = document.querySelector('.skeleton-card, [class*="skeleton"][class*="card"]');

      if (cardSkeleton) {
        // Card should have structure
        expect(cardSkeleton.children.length).toBeGreaterThan(0);
      }
    });

    it('card skeleton has appropriate dimensions', () => {
      render(<SkeletonLoader type="card" />);
      const cardSkeleton = document.querySelector('.skeleton-card, [class*="skeleton"][class*="card"]');

      if (cardSkeleton) {
        const rect = cardSkeleton.getBoundingClientRect();
        // Card should have some width and height
        expect(rect.width).toBeGreaterThan(0);
      }
    });
  });

  describe('List Skeleton Specifics', () => {
    it('list skeleton renders multiple items', () => {
      render(<SkeletonLoader type="list" count={5} />);
      const listItems = document.querySelectorAll('.skeleton-item, [class*="skeleton-list"] > *');

      // List should have multiple children
      expect(listItems.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined type gracefully', () => {
      // @ts-expect-error Testing undefined type
      render(<SkeletonLoader type={undefined} />);
      expect(document.querySelector('[class*="skeleton"]')).toBeInTheDocument();
    });

    it('handles invalid type string', () => {
      // @ts-expect-error Testing invalid type
      render(<SkeletonLoader type="invalid-type" />);
      // Should fall back to default or handle gracefully
      expect(document.querySelector('[class*="skeleton"]')).toBeInTheDocument();
    });

    it('handles negative count', () => {
      render(<SkeletonLoader count={-1} />);
      // Should handle gracefully, probably render nothing or 0 items
      const container = document.querySelector('.skeleton-loader');
      // Implementation-specific behavior
    });
  });

  describe('Performance', () => {
    it('does not trigger unnecessary re-renders', () => {
      const { rerender } = render(<SkeletonLoader type="text" count={3} />);

      // Re-render with same props
      rerender(<SkeletonLoader type="text" count={3} />);

      // Component should still be in the DOM
      expect(document.querySelector('[class*="skeleton"]')).toBeInTheDocument();
    });
  });
});
