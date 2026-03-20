import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SystemNav } from '../SystemNav';
import { SYSTEM_SECTIONS } from '../types';

describe('SystemPage/SystemNav', () => {
  const defaultProps = {
    value: 'profil' as const,
    onChange: vi.fn(),
  };

  it('renders all 5 section headings', () => {
    render(<SystemNav {...defaultProps} />);
    SYSTEM_SECTIONS.forEach(section => {
      expect(screen.getByText(section.label)).toBeInTheDocument();
    });
  });

  it('renders all 10 tab buttons', () => {
    render(<SystemNav {...defaultProps} />);
    const allTabs = SYSTEM_SECTIONS.flatMap(s => s.tabs);
    allTabs.forEach(tab => {
      expect(screen.getByText(tab.label)).toBeInTheDocument();
    });
  });

  it('marks active tab with active class', () => {
    render(<SystemNav {...defaultProps} value="ki" />);
    expect(screen.getByText('KI-Einstellungen')).toHaveClass('system-nav__item--active');
  });

  it('marks active tab with aria-current="page"', () => {
    render(<SystemNav {...defaultProps} value="sicherheit" />);
    expect(screen.getByText('Sicherheit')).toHaveAttribute('aria-current', 'page');
  });

  it('non-active tabs have no aria-current', () => {
    render(<SystemNav {...defaultProps} value="profil" />);
    expect(screen.getByText('Konto')).not.toHaveAttribute('aria-current');
  });

  it('calls onChange when tab is clicked', () => {
    const onChange = vi.fn();
    render(<SystemNav {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Daten'));
    expect(onChange).toHaveBeenCalledWith('daten');
  });

  it('has nav element with aria-label', () => {
    render(<SystemNav {...defaultProps} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'System-Navigation');
  });
});
