import { render, screen, fireEvent } from '@testing-library/react';
import { SlashCommandMenu } from '../SlashCommandMenu';

describe('SlashCommandMenu', () => {
  const defaultProps = {
    query: '',
    onSelect: vi.fn(),
    onClose: vi.fn(),
    visible: true,
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders all commands when query is empty', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    expect(screen.getByText('Neuer Task')).toBeInTheDocument();
    expect(screen.getByText('Neue Email')).toBeInTheDocument();
    expect(screen.getByText('Neue Idee')).toBeInTheDocument();
  });

  it('filters commands by query', () => {
    render(<SlashCommandMenu {...defaultProps} query="task" />);
    expect(screen.getByText('Neuer Task')).toBeInTheDocument();
    expect(screen.queryByText('Neue Email')).not.toBeInTheDocument();
  });

  it('calls onSelect when command is clicked', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    fireEvent.click(screen.getByText('Neuer Task'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'task', panel: 'tasks' })
    );
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<SlashCommandMenu {...defaultProps} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onClose on Escape key', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows all 8 commands when query is empty', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    expect(screen.getByText('Suchen')).toBeInTheDocument();
    expect(screen.getByText('Kalender')).toBeInTheDocument();
    expect(screen.getByText('Kontakte')).toBeInTheDocument();
    expect(screen.getByText('Dokumente')).toBeInTheDocument();
    expect(screen.getByText('Gedaechtnis')).toBeInTheDocument();
  });

  it('filters case-insensitively', () => {
    render(<SlashCommandMenu {...defaultProps} query="TASK" />);
    expect(screen.getByText('Neuer Task')).toBeInTheDocument();
    expect(screen.queryByText('Neue Email')).not.toBeInTheDocument();
  });

  it('filters by label as well as command name', () => {
    render(<SlashCommandMenu {...defaultProps} query="Email" />);
    expect(screen.getByText('Neue Email')).toBeInTheDocument();
    expect(screen.queryByText('Neuer Task')).not.toBeInTheDocument();
  });

  it('shows empty state when no commands match', () => {
    render(<SlashCommandMenu {...defaultProps} query="xyznotexist" />);
    expect(screen.getByText(/keine befehle/i)).toBeInTheDocument();
  });

  it('renders command descriptions', () => {
    render(<SlashCommandMenu {...defaultProps} query="task" />);
    expect(screen.getByText('Task-Panel oeffnen')).toBeInTheDocument();
  });

  it('renders /command shorthand text', () => {
    render(<SlashCommandMenu {...defaultProps} query="task" />);
    expect(screen.getByText('/task')).toBeInTheDocument();
  });

  it('highlights the first item by default', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    const items = screen.getAllByRole('option');
    expect(items[0]).toHaveClass('slash-menu__item--active');
  });

  it('navigates down with ArrowDown key', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    const items = screen.getAllByRole('option');
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(items[1]).toHaveClass('slash-menu__item--active');
  });

  it('navigates up with ArrowUp key', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    // Move down first
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    const items = screen.getAllByRole('option');
    expect(items[1]).toHaveClass('slash-menu__item--active');
  });

  it('selects active item on Enter key', () => {
    render(<SlashCommandMenu {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(defaultProps.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'task' })
    );
  });

  it('does not render when visible changes to false', () => {
    const { rerender, container } = render(<SlashCommandMenu {...defaultProps} visible={true} />);
    expect(container.firstChild).not.toBeNull();
    rerender(<SlashCommandMenu {...defaultProps} visible={false} />);
    expect(container.firstChild).toBeNull();
  });
});
