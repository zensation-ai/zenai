/**
 * Smoke Tests
 *
 * Basic sanity tests to verify the test setup is working.
 * These tests should always pass if the test environment is configured correctly.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Test Setup Smoke Tests', () => {
  it('should pass basic assertions', () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
    expect('hello').toContain('ell');
  });

  it('should render a simple component', () => {
    const TestComponent = () => <div data-testid="test">Hello Test</div>;

    render(<TestComponent />);

    expect(screen.getByTestId('test')).toBeInTheDocument();
    expect(screen.getByText('Hello Test')).toBeInTheDocument();
  });

  it('should have IntersectionObserver mock available', () => {
    expect(global.IntersectionObserver).toBeDefined();
    const observer = new IntersectionObserver(() => {});
    expect(observer).toBeDefined();
  });

  it('should have ResizeObserver mock available', () => {
    expect(global.ResizeObserver).toBeDefined();
    const observer = new ResizeObserver(() => {});
    expect(observer).toBeDefined();
  });

  it('should have matchMedia mock available', () => {
    expect(window.matchMedia).toBeDefined();
    const result = window.matchMedia('(min-width: 768px)');
    expect(result.matches).toBe(false);
  });
});
