import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SparkLogo } from '../layout/SparkLogo';

describe('SparkLogo', () => {
  it('renders an SVG with correct viewBox', () => {
    const { container } = render(<SparkLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100');
  });

  it('uses default size of 32', () => {
    const { container } = render(<SparkLogo />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
  });

  it('accepts custom size', () => {
    const { container } = render(<SparkLogo size={64} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('64');
  });

  it('has aria-hidden for decorative usage', () => {
    const { container } = render(<SparkLogo />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders unique gradient IDs (no collisions)', () => {
    const { container } = render(
      <div>
        <SparkLogo />
        <SparkLogo />
      </div>
    );
    const gradients = container.querySelectorAll('radialGradient');
    const ids = Array.from(gradients).map((g) => g.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('renders three outer nodes', () => {
    const { container } = render(<SparkLogo />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(8);
  });

  it('renders three converging lines', () => {
    const { container } = render(<SparkLogo />);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(3);
  });

  it('supports dark variant (default)', () => {
    const { container } = render(<SparkLogo variant="dark" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('supports light variant', () => {
    const { container } = render(<SparkLogo variant="light" />);
    const orbitRing = container.querySelector('circle[stroke="#144A56"]');
    expect(orbitRing).toBeTruthy();
  });
});
