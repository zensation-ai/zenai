import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CockpitSmartPage } from '../CockpitSmartPage';

describe('CockpitSmartPage', () => {
  const defaultProps = {
    context: 'personal',
  };

  it('renders with default view (Übersicht)', () => {
    render(<CockpitSmartPage {...defaultProps} />);
    expect(screen.getByTestId('cockpit-view-uebersicht')).toBeInTheDocument();
  });

  it('renders ViewToggle with all 4 views', () => {
    render(<CockpitSmartPage {...defaultProps} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Übersicht' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Business' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Finanzen' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trends' })).toBeInTheDocument();
  });

  it('renders TimeRangeChips', () => {
    render(<CockpitSmartPage {...defaultProps} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 Tage' })).toHaveAttribute('aria-checked', 'true');
  });

  it('switches view when ViewToggle is clicked', () => {
    render(<CockpitSmartPage {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Finanzen' }));
    expect(screen.getByTestId('cockpit-view-finanzen')).toBeInTheDocument();
    expect(screen.queryByTestId('cockpit-view-uebersicht')).not.toBeInTheDocument();
  });

  it('switches time range when chip is clicked', () => {
    render(<CockpitSmartPage {...defaultProps} />);
    fireEvent.click(screen.getByRole('radio', { name: '7 Tage' }));
    expect(screen.getByRole('radio', { name: '7 Tage' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('cockpit-view-uebersicht')).toHaveAttribute('data-range', '7d');
  });

  it('passes context to child views', () => {
    render(<CockpitSmartPage {...defaultProps} context="work" />);
    expect(screen.getByTestId('cockpit-view-uebersicht')).toHaveAttribute('data-context', 'work');
  });

  it('respects initialTab prop', () => {
    render(<CockpitSmartPage {...defaultProps} initialTab="business" />);
    expect(screen.getByTestId('cockpit-view-business')).toBeInTheDocument();
  });

  it('resolves English tab aliases', () => {
    render(<CockpitSmartPage {...defaultProps} initialTab="finance" />);
    expect(screen.getByTestId('cockpit-view-finanzen')).toBeInTheDocument();
  });

  it('falls back to uebersicht for unknown tab', () => {
    render(<CockpitSmartPage {...defaultProps} initialTab="nonexistent" />);
    expect(screen.getByTestId('cockpit-view-uebersicht')).toBeInTheDocument();
  });

  it('renders all views when toggled through', () => {
    render(<CockpitSmartPage {...defaultProps} />);
    const viewNames = ['Business', 'Finanzen', 'Trends', 'Übersicht'];
    const testIds = ['cockpit-view-business', 'cockpit-view-finanzen', 'cockpit-view-trends', 'cockpit-view-uebersicht'];

    viewNames.forEach((name, i) => {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(screen.getByTestId(testIds[i])).toBeInTheDocument();
    });
  });
});
