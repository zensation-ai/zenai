import { render, screen, fireEvent } from '@testing-library/react';
import { PanelShell } from '../PanelShell';

describe('PanelShell', () => {
  const defaultProps = {
    title: 'Aufgaben',
    icon: ({ size }: { size?: number }) => <span data-testid="icon">icon</span>,
    pinned: false,
    onClose: vi.fn(),
    onTogglePin: vi.fn(),
    width: 420,
    onResize: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and close button', () => {
    render(
      <PanelShell {...defaultProps}>
        <div>content</div>
      </PanelShell>
    );
    expect(screen.getByText('Aufgaben')).toBeInTheDocument();
    expect(screen.getByLabelText('Panel schliessen')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    render(
      <PanelShell {...defaultProps}>
        <div>content</div>
      </PanelShell>
    );
    fireEvent.click(screen.getByLabelText('Panel schliessen'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onTogglePin when pin button clicked', () => {
    render(
      <PanelShell {...defaultProps}>
        <div>content</div>
      </PanelShell>
    );
    fireEvent.click(screen.getByLabelText('Panel anpinnen'));
    expect(defaultProps.onTogglePin).toHaveBeenCalled();
  });

  it('shows pinned state visually', () => {
    render(
      <PanelShell {...defaultProps} pinned={true}>
        <div>content</div>
      </PanelShell>
    );
    expect(screen.getByLabelText('Panel lospinnen')).toBeInTheDocument();
  });

  it('renders children in scrollable content area', () => {
    render(
      <PanelShell {...defaultProps}>
        <div data-testid="child">Hello</div>
      </PanelShell>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
