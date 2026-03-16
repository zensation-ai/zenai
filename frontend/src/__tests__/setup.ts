/**
 * Vitest Test Setup
 *
 * Configures the testing environment for React components.
 * Sets up Jest-DOM matchers and global test utilities.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Mock framer-motion to avoid useContext errors in jsdom
vi.mock('framer-motion', () => {
  const actual = vi.importActual('framer-motion');
  return {
    ...actual,
    motion: new Proxy({}, {
      get: (_target, prop: string) => {
        // Return a forwardRef component that renders the HTML element
        const { forwardRef } = require('react');
        return forwardRef((props: Record<string, unknown>, ref: unknown) => {
          // Strip framer-motion-specific props
          const {
            variants, initial, animate, exit, transition, whileHover,
            whileTap, whileFocus, whileInView, layout, layoutId,
            onAnimationStart, onAnimationComplete, ...rest
          } = props;
          const { createElement } = require('react');
          return createElement(prop, { ...rest, ref });
        });
      },
    }),
    AnimatePresence: ({ children }: { children: unknown }) => children,
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn(), set: vi.fn() }),
    useMotionValue: (v: number) => ({ get: () => v, set: vi.fn(), on: vi.fn() }),
    useTransform: (v: unknown) => v,
  };
});

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock IntersectionObserver (not available in jsdom)
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor() {}

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock ResizeObserver (not available in jsdom)
class MockResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock URL.createObjectURL and revokeObjectURL for file handling
global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

// Mock matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Filter out React act() warnings that occur due to async state updates
// These warnings are common with external state management and timers
const originalError = console.error;
console.error = (...args: Parameters<typeof console.error>) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    message.includes('inside a test was not wrapped in act')
  ) {
    // Suppress act() warnings - they don't affect test correctness
    return;
  }
  originalError.apply(console, args);
};
