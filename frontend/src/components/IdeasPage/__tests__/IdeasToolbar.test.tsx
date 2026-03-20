import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeasToolbar } from '../IdeasToolbar';

describe('IdeasToolbar', () => {
  const defaultProps = {
    viewMode: 'grid' as const,
    onViewChange: vi.fn(),
    search: '',
    onSearchChange: vi.fn(),
    sort: { field: 'created_at' as const, direction: 'desc' as const },
    onSortChange: vi.fn(),
    selectionMode: false,
    onToggleSelection: vi.fn(),
    selectedCount: 0,
    onBatchArchive: vi.fn(),
    onBatchDelete: vi.fn(),
  };

  it('renders search input', () => {
    render(<IdeasToolbar {...defaultProps} />);
    expect(screen.getByPlaceholderText(/suchen/i)).toBeInTheDocument();
  });

  it('renders view toggle', () => {
    render(<IdeasToolbar {...defaultProps} />);
    expect(screen.getByRole('group', { name: /ansicht/i })).toBeInTheDocument();
  });

  it('fires search change on input', () => {
    render(<IdeasToolbar {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/suchen/i), { target: { value: 'test' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('test');
  });

  it('shows batch actions when selectionMode is true', () => {
    render(<IdeasToolbar {...defaultProps} selectionMode={true} selectedCount={3} />);
    expect(screen.getByText(/3 ausgewaehlt/i)).toBeInTheDocument();
  });

  it('hides batch actions when selectionMode is false', () => {
    render(<IdeasToolbar {...defaultProps} />);
    expect(screen.queryByText(/ausgewaehlt/i)).not.toBeInTheDocument();
  });
});
