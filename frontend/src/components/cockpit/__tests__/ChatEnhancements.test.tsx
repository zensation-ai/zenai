import { render, screen, fireEvent } from '@testing-library/react';
import { PanelTriggerLink } from '../PanelTriggerLink';
import { ActionButtons } from '../ActionButtons';
import { InlineWidget } from '../InlineWidget';

describe('PanelTriggerLink', () => {
  it('renders label with arrow', () => {
    render(<PanelTriggerLink label="3 Tasks" panel="tasks" onOpenPanel={vi.fn()} />);
    expect(screen.getByText('3 Tasks →')).toBeInTheDocument();
  });

  it('calls onOpenPanel with panel and filter', () => {
    const onOpen = vi.fn();
    render(<PanelTriggerLink label="Tasks" panel="tasks" filter="today" onOpenPanel={onOpen} />);
    fireEvent.click(screen.getByText('Tasks →'));
    expect(onOpen).toHaveBeenCalledWith('tasks', 'today');
  });

  it('calls onOpenPanel without filter when not provided', () => {
    const onOpen = vi.fn();
    render(<PanelTriggerLink label="Emails" panel="email" onOpenPanel={onOpen} />);
    fireEvent.click(screen.getByText('Emails →'));
    expect(onOpen).toHaveBeenCalledWith('email', undefined);
  });

  it('has correct aria-label', () => {
    render(<PanelTriggerLink label="3 Tasks" panel="tasks" onOpenPanel={vi.fn()} />);
    expect(screen.getByRole('button', { name: '3 Tasks anzeigen' })).toBeInTheDocument();
  });
});

describe('ActionButtons', () => {
  it('renders all action buttons', () => {
    const actions = [
      { id: 'send', label: 'Senden', variant: 'primary' as const, action: vi.fn() },
      { id: 'edit', label: 'Bearbeiten', action: vi.fn() },
      { id: 'discard', label: 'Verwerfen', variant: 'danger' as const, action: vi.fn() },
    ];
    render(<ActionButtons actions={actions} />);
    expect(screen.getByText('Senden')).toBeInTheDocument();
    expect(screen.getByText('Bearbeiten')).toBeInTheDocument();
    expect(screen.getByText('Verwerfen')).toBeInTheDocument();
  });

  it('calls action on click', () => {
    const action = vi.fn();
    render(<ActionButtons actions={[{ id: 'send', label: 'Senden', action }]} />);
    fireEvent.click(screen.getByText('Senden'));
    expect(action).toHaveBeenCalled();
  });

  it('applies correct variant class', () => {
    render(
      <ActionButtons
        actions={[
          { id: 'primary', label: 'Primary', variant: 'primary', action: vi.fn() },
          { id: 'danger', label: 'Danger', variant: 'danger', action: vi.fn() },
          { id: 'secondary', label: 'Secondary', action: vi.fn() },
        ]}
      />
    );
    expect(screen.getByText('Primary').className).toContain('action-buttons__btn--primary');
    expect(screen.getByText('Danger').className).toContain('action-buttons__btn--danger');
    expect(screen.getByText('Secondary').className).toContain('action-buttons__btn--secondary');
  });

  it('renders empty state without errors', () => {
    const { container } = render(<ActionButtons actions={[]} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe('InlineWidget', () => {
  it('renders task widget', () => {
    render(<InlineWidget type="task" title="Deploy vorbereiten" status="pending" />);
    expect(screen.getByText('Deploy vorbereiten')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<InlineWidget type="email" title="Meeting Update" subtitle="Von: Max" />);
    expect(screen.getByText('Von: Max')).toBeInTheDocument();
  });

  it('calls onClick when clickable', () => {
    const onClick = vi.fn();
    render(<InlineWidget type="contact" title="Max" onClick={onClick} />);
    fireEvent.click(screen.getByText('Max'));
    expect(onClick).toHaveBeenCalled();
  });

  it('does not render subtitle when not provided', () => {
    render(<InlineWidget type="task" title="My Task" />);
    expect(screen.queryByText(/subtitle/i)).not.toBeInTheDocument();
  });

  it('does not render status when not provided', () => {
    const { container } = render(<InlineWidget type="task" title="My Task" />);
    expect(container.querySelector('.inline-widget__status')).not.toBeInTheDocument();
  });

  it('has role=button when onClick is provided', () => {
    render(<InlineWidget type="task" title="My Task" onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not have role=button when onClick is not provided', () => {
    render(<InlineWidget type="task" title="My Task" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders all widget types without error', () => {
    const types = ['task', 'email', 'contact', 'event'] as const;
    for (const type of types) {
      const { unmount } = render(<InlineWidget type={type} title={`${type} title`} />);
      expect(screen.getByText(`${type} title`)).toBeInTheDocument();
      unmount();
    }
  });
});
