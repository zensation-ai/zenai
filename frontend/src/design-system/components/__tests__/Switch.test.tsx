import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from '../Switch';

describe('Switch', () => {
  it('renders as checkbox with switch role', () => {
    render(<Switch label="Dark Mode" checked={false} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toBeDefined();
  });
  it('renders visible label text', () => {
    render(<Switch label="Notifications" checked={false} onChange={() => {}} />);
    expect(screen.getByText('Notifications')).toBeDefined();
  });
  it('reflects checked state', () => {
    const { rerender } = render(<Switch label="Toggle" checked={false} onChange={() => {}} />);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    rerender(<Switch label="Toggle" checked={true} onChange={() => {}} />);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);
  });
  it('calls onChange when toggled', () => {
    const onChange = vi.fn();
    render(<Switch label="Toggle" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledOnce();
  });
  it('supports disabled state', () => {
    const { container } = render(<Switch label="Off" checked={false} onChange={() => {}} disabled />);
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('.ds-switch--disabled')).not.toBeNull();
  });
});
