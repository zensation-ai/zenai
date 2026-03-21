/**
 * Unit Tests for GuidedTour Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuidedTour } from '../GuidedTour';
import { TOUR_STEPS } from '../tour-steps';

const defaultProps = {
  isActive: true,
  currentStep: 0,
  totalSteps: TOUR_STEPS.length,
  step: TOUR_STEPS[0],
  next: vi.fn(),
  back: vi.fn(),
  skip: vi.fn(),
  onNavigate: vi.fn(),
};

describe('GuidedTour Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getBoundingClientRect for querySelector results
    vi.spyOn(document, 'querySelector').mockReturnValue(null);
  });

  it('renders step title', () => {
    render(<GuidedTour {...defaultProps} />);
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
  });

  it('renders step description', () => {
    render(<GuidedTour {...defaultProps} />);
    expect(screen.getByText(TOUR_STEPS[0].description)).toBeInTheDocument();
  });

  it('renders step counter', () => {
    render(<GuidedTour {...defaultProps} />);
    expect(screen.getByText(`Schritt 1 / ${TOUR_STEPS.length}`)).toBeInTheDocument();
  });

  it('clicking Weiter calls next', () => {
    render(<GuidedTour {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(defaultProps.next).toHaveBeenCalledTimes(1);
  });

  it('clicking Überspringen calls skip', () => {
    render(<GuidedTour {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Überspringen' }));
    expect(defaultProps.skip).toHaveBeenCalledTimes(1);
  });

  it('does not render when isActive is false', () => {
    render(<GuidedTour {...defaultProps} isActive={false} />);
    expect(screen.queryByText(TOUR_STEPS[0].title)).not.toBeInTheDocument();
  });

  it('shows Zurück button when not on first step', () => {
    render(
      <GuidedTour
        {...defaultProps}
        currentStep={1}
        step={TOUR_STEPS[1]}
      />
    );
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeInTheDocument();
  });

  it('does not show Zurück on first step', () => {
    render(<GuidedTour {...defaultProps} currentStep={0} step={TOUR_STEPS[0]} />);
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument();
  });

  it('clicking Zurück calls back', () => {
    render(
      <GuidedTour
        {...defaultProps}
        currentStep={1}
        step={TOUR_STEPS[1]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(defaultProps.back).toHaveBeenCalledTimes(1);
  });

  it('shows Fertig on last step', () => {
    const lastIndex = TOUR_STEPS.length - 1;
    render(
      <GuidedTour
        {...defaultProps}
        currentStep={lastIndex}
        step={TOUR_STEPS[lastIndex]}
      />
    );
    expect(screen.getByRole('button', { name: 'Fertig' })).toBeInTheDocument();
  });

  it('renders progress dots equal to totalSteps', () => {
    render(<GuidedTour {...defaultProps} />);
    const dots = screen.getAllByRole('listitem');
    expect(dots).toHaveLength(TOUR_STEPS.length);
  });

  it('calls onNavigate with step page on mount', () => {
    render(<GuidedTour {...defaultProps} />);
    expect(defaultProps.onNavigate).toHaveBeenCalledWith(TOUR_STEPS[0].page);
  });

  it('has accessible dialog role', () => {
    render(<GuidedTour {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
