import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WissenSmartPage } from '../WissenSmartPage';

describe('WissenSmartPage', () => {
  it('renders the ViewToggle', () => {
    render(<WissenSmartPage context="personal" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('shows the dokumente view by default', () => {
    render(<WissenSmartPage context="personal" />);
    expect(screen.getByTestId('wissen-view-dokumente')).toBeInTheDocument();
  });

  it('does not show other views by default', () => {
    render(<WissenSmartPage context="personal" />);
    expect(screen.queryByTestId('wissen-view-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wissen-view-medien')).not.toBeInTheDocument();
  });

  it('switches view when ViewToggle is clicked', () => {
    render(<WissenSmartPage context="personal" />);
    fireEvent.click(screen.getByText('Canvas'));
    expect(screen.getByTestId('wissen-view-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('wissen-view-dokumente')).not.toBeInTheDocument();
  });

  it('switches to medien view', () => {
    render(<WissenSmartPage context="personal" />);
    fireEvent.click(screen.getByText('Medien'));
    expect(screen.getByTestId('wissen-view-medien')).toBeInTheDocument();
  });

  it('switches to verbindungen view', () => {
    render(<WissenSmartPage context="personal" />);
    fireEvent.click(screen.getByText('Verbindungen'));
    expect(screen.getByTestId('wissen-view-verbindungen')).toBeInTheDocument();
  });

  it('switches to lernen view', () => {
    render(<WissenSmartPage context="personal" />);
    fireEvent.click(screen.getByText('Lernen'));
    expect(screen.getByTestId('wissen-view-lernen')).toBeInTheDocument();
  });

  it('respects initialTab prop for canvas', () => {
    render(<WissenSmartPage context="personal" initialTab="canvas" />);
    expect(screen.getByTestId('wissen-view-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('wissen-view-dokumente')).not.toBeInTheDocument();
  });

  it('respects initialTab prop for editor (maps to canvas)', () => {
    render(<WissenSmartPage context="personal" initialTab="editor" />);
    expect(screen.getByTestId('wissen-view-canvas')).toBeInTheDocument();
  });

  it('respects initialTab prop for media (maps to medien)', () => {
    render(<WissenSmartPage context="personal" initialTab="media" />);
    expect(screen.getByTestId('wissen-view-medien')).toBeInTheDocument();
  });

  it('renders with a Suspense boundary (no crash)', () => {
    expect(() =>
      render(<WissenSmartPage context="work" />)
    ).not.toThrow();
  });

  it('has the wissen-smart-page root class', () => {
    const { container } = render(<WissenSmartPage context="personal" />);
    expect(container.firstChild).toHaveClass('wissen-smart-page');
  });
});
