import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SystemSmartPage } from '../SystemSmartPage';

describe('SystemSmartPage', () => {
  const defaultProps = { context: 'personal' };

  it('renders with default tab (profil)', () => {
    render(<SystemSmartPage {...defaultProps} />);
    expect(screen.getByTestId('system-view-profil')).toBeInTheDocument();
  });

  it('renders SystemNav', () => {
    render(<SystemSmartPage {...defaultProps} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('switches tab when nav item is clicked', () => {
    render(<SystemSmartPage {...defaultProps} />);
    fireEvent.click(screen.getByText('KI-Einstellungen'));
    expect(screen.getByTestId('system-view-ki')).toBeInTheDocument();
  });

  it('passes context to content', () => {
    render(<SystemSmartPage context="work" />);
    expect(screen.getByTestId('system-view-profil')).toHaveAttribute('data-context', 'work');
  });

  it('respects initialTab prop', () => {
    render(<SystemSmartPage {...defaultProps} initialTab="sicherheit" />);
    expect(screen.getByTestId('system-view-sicherheit')).toBeInTheDocument();
  });

  it('resolves English aliases', () => {
    render(<SystemSmartPage {...defaultProps} initialTab="privacy" />);
    expect(screen.getByTestId('system-view-datenschutz')).toBeInTheDocument();
  });

  it('resolves ai alias to ki', () => {
    render(<SystemSmartPage {...defaultProps} initialTab="ai" />);
    expect(screen.getByTestId('system-view-ki')).toBeInTheDocument();
  });

  it('falls back to profil for unknown tab', () => {
    render(<SystemSmartPage {...defaultProps} initialTab="unknown" />);
    expect(screen.getByTestId('system-view-profil')).toBeInTheDocument();
  });

  it('navigates through multiple tabs', () => {
    render(<SystemSmartPage {...defaultProps} />);
    fireEvent.click(screen.getByText('Integrationen'));
    expect(screen.getByTestId('system-view-integrationen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Daten'));
    expect(screen.getByTestId('system-view-daten')).toBeInTheDocument();
  });
});
