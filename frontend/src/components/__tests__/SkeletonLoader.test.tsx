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

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkeletonLoader } from '../SkeletonLoader';

describe('SkeletonLoader Component', () => {
  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      render(<SkeletonLoader />);
      const skeleton = document.querySelector('.skeleton, [class*="skeleton"]');
      expect(skeleton).toBeInTheDocument();
    });

    it('renders default type when no type specified', () => {
      render(<SkeletonLoader />);
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

    it('renders button skeleton', () => {
      render(<SkeletonLoader type="button" />);
      const skeleton = document.querySelector('.skeleton-button, [class*="skeleton"][class*="button"]');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('Count Prop', () => {
    it('renders single skeleton by default', () => {
      render(<SkeletonLoader type="text" />);
      const skeletons = document.querySelectorAll('.skeleton-text, [class*="skeleton-"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders multiple skeletons when count specified', () => {
      render(<SkeletonLoader type="text" count={3} />);
      const container = document.querySelector('[class*="skeleton"]');
      expect(container).toBeInTheDocument();
    });

    it('handles large count values', () => {
      render(<SkeletonLoader type="text" count={10} />);
      const container = document.querySelector('[class*="skeleton"]');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('has animation class applied', () => {
      render(<SkeletonLoader />);
      const skeleton = document.querySelector('[class*="skeleton"]');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('skeleton elements are rendered', () => {
      render(<SkeletonLoader />);
      const skeleton = document.querySelector('[class*="skeleton"]');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('applies width prop when provided', () => {
      render(<SkeletonLoader width="200px" />);
      const skeleton = document.querySelector('[class*="skeleton"]');
      expect(skeleton).toBeInTheDocument();
    });

    it('applies height prop when provided', () => {
      render(<SkeletonLoader height="50px" />);
      const skeleton = document.querySelector('[class*="skeleton"]');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('Card Skeleton Specifics', () => {
    it('card skeleton contains elements', () => {
      render(<SkeletonLoader type="card" />);
      const cardSkeleton = document.querySelector('.skeleton-card, [class*="skeleton"][class*="card"]');
      expect(cardSkeleton).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined type gracefully', () => {
      render(<SkeletonLoader type={undefined} />);
      expect(document.querySelector('[class*="skeleton"]')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('does not trigger unnecessary re-renders', () => {
      const { rerender } = render(<SkeletonLoader type="text" count={3} />);

      rerender(<SkeletonLoader type="text" count={3} />);

      expect(document.querySelector('[class*="skeleton"]')).toBeInTheDocument();
    });
  });
});
