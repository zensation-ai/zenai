import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Divider } from '../Divider';

describe('Divider', () => {
  it('renders an hr with role="separator"', () => {
    const { container } = render(<Divider />);
    const hr = container.querySelector('hr');
    expect(hr).not.toBeNull();
    expect(hr?.getAttribute('role')).toBe('separator');
  });
  it('defaults to horizontal orientation', () => {
    const { container } = render(<Divider />);
    expect(container.querySelector('.ds-divider--horizontal')).not.toBeNull();
  });
  it('supports vertical orientation', () => {
    const { container } = render(<Divider orientation="vertical" />);
    expect(container.querySelector('.ds-divider--vertical')).not.toBeNull();
  });
  it('renders label text when provided', () => {
    const { container } = render(<Divider label="oder" />);
    expect(container.querySelector('.ds-divider__label')?.textContent).toBe('oder');
  });
});
