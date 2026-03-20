import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeineKISmartPage } from '../MeineKISmartPage';

describe('MeineKISmartPage', () => {
  const defaultProps = { context: 'personal' };

  it('renders with default view (Persona)', () => {
    render(<MeineKISmartPage {...defaultProps} />);
    expect(screen.getByTestId('meine-ki-view-persona')).toBeInTheDocument();
  });

  it('renders ViewToggle with all 4 views', () => {
    render(<MeineKISmartPage {...defaultProps} />);
    expect(screen.getByRole('tab', { name: 'Persona' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Wissen' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Prozeduren' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stimme' })).toBeInTheDocument();
  });

  it('switches view on toggle click', () => {
    render(<MeineKISmartPage {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Wissen' }));
    expect(screen.getByTestId('meine-ki-view-wissen')).toBeInTheDocument();
    expect(screen.queryByTestId('meine-ki-view-persona')).not.toBeInTheDocument();
  });

  it('passes context to views', () => {
    render(<MeineKISmartPage context="work" />);
    expect(screen.getByTestId('meine-ki-view-persona')).toHaveAttribute('data-context', 'work');
  });

  it('respects initialTab prop', () => {
    render(<MeineKISmartPage {...defaultProps} initialTab="stimme" />);
    expect(screen.getByTestId('meine-ki-view-stimme')).toBeInTheDocument();
  });

  it('resolves English aliases', () => {
    render(<MeineKISmartPage {...defaultProps} initialTab="voice-chat" />);
    expect(screen.getByTestId('meine-ki-view-stimme')).toBeInTheDocument();
  });

  it('resolves memory alias to wissen', () => {
    render(<MeineKISmartPage {...defaultProps} initialTab="memory" />);
    expect(screen.getByTestId('meine-ki-view-wissen')).toBeInTheDocument();
  });

  it('falls back to persona for unknown tab', () => {
    render(<MeineKISmartPage {...defaultProps} initialTab="unknown" />);
    expect(screen.getByTestId('meine-ki-view-persona')).toBeInTheDocument();
  });

  it('cycles through all views', () => {
    render(<MeineKISmartPage {...defaultProps} />);
    const views = ['Wissen', 'Prozeduren', 'Stimme', 'Persona'];
    const testIds = ['meine-ki-view-wissen', 'meine-ki-view-prozeduren', 'meine-ki-view-stimme', 'meine-ki-view-persona'];
    views.forEach((name, i) => {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(screen.getByTestId(testIds[i])).toBeInTheDocument();
    });
  });
});
