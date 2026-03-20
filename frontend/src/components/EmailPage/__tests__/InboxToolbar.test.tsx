/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxToolbar } from '../InboxToolbar';

// Mock ViewToggle to isolate toolbar tests
vi.mock('../ViewToggle', () => ({
  ViewToggle: ({ active, onChange }: any) => (
    <div data-testid="view-toggle" data-active={active} onClick={() => onChange('grid')}>
      ViewToggle
    </div>
  ),
}));

const defaultProps = {
  viewMode: 'list' as const,
  onViewChange: vi.fn(),
  search: '',
  onSearchChange: vi.fn(),
  onCompose: vi.fn(),
  selectionMode: false,
  onToggleSelection: vi.fn(),
  selectedCount: 0,
  onBatchArchive: vi.fn(),
  onBatchDelete: vi.fn(),
};

describe('InboxToolbar', () => {
  it('renders search input with placeholder', () => {
    render(<InboxToolbar {...defaultProps} />);
    expect(screen.getByPlaceholderText('E-Mails suchen...')).toBeInTheDocument();
  });

  it('renders compose button', () => {
    render(<InboxToolbar {...defaultProps} />);
    expect(screen.getByText('Verfassen')).toBeInTheDocument();
  });

  it('renders ViewToggle', () => {
    render(<InboxToolbar {...defaultProps} />);
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });

  it('calls onSearchChange when typing', () => {
    const onSearchChange = vi.fn();
    render(<InboxToolbar {...defaultProps} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByPlaceholderText('E-Mails suchen...'), {
      target: { value: 'test' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('test');
  });

  it('calls onCompose when compose button clicked', () => {
    const onCompose = vi.fn();
    render(<InboxToolbar {...defaultProps} onCompose={onCompose} />);
    fireEvent.click(screen.getByText('Verfassen'));
    expect(onCompose).toHaveBeenCalled();
  });

  it('shows batch actions in selection mode', () => {
    render(<InboxToolbar {...defaultProps} selectionMode={true} selectedCount={3} />);
    expect(screen.getByText('3 ausgewaehlt')).toBeInTheDocument();
    expect(screen.getByLabelText('Archivieren')).toBeInTheDocument();
    expect(screen.getByLabelText('Loeschen')).toBeInTheDocument();
  });

  it('hides search and compose in selection mode', () => {
    render(<InboxToolbar {...defaultProps} selectionMode={true} selectedCount={2} />);
    expect(screen.queryByPlaceholderText('E-Mails suchen...')).not.toBeInTheDocument();
    expect(screen.queryByText('Verfassen')).not.toBeInTheDocument();
  });

  it('calls onBatchArchive and onBatchDelete', () => {
    const onBatchArchive = vi.fn();
    const onBatchDelete = vi.fn();
    render(
      <InboxToolbar
        {...defaultProps}
        selectionMode={true}
        selectedCount={1}
        onBatchArchive={onBatchArchive}
        onBatchDelete={onBatchDelete}
      />,
    );
    fireEvent.click(screen.getByLabelText('Archivieren'));
    expect(onBatchArchive).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Loeschen'));
    expect(onBatchDelete).toHaveBeenCalled();
  });

  it('has search role on search container', () => {
    render(<InboxToolbar {...defaultProps} />);
    expect(screen.getByRole('search')).toBeInTheDocument();
  });
});
