import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChipBar } from '../FilterChipBar';
import type { FilterChipDef, IdeaFilters, IdeaStatus } from '../types';
import { DEFAULT_FILTERS } from '../types';

const mockChips: FilterChipDef[] = [
  { id: 'status-active', label: 'Aktiv', group: 'status', value: 'active' },
  { id: 'status-archived', label: 'Archiv', group: 'status', value: 'archived' },
  { id: 'type-task', label: 'Aufgabe', group: 'type', value: 'task' },
];

const activeFilters: IdeaFilters = {
  ...DEFAULT_FILTERS,
  status: new Set<IdeaStatus>(['active']),
};

describe('FilterChipBar', () => {
  it('renders all chip definitions', () => {
    render(<FilterChipBar chips={mockChips} filters={activeFilters} onToggle={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByText('Archiv')).toBeInTheDocument();
    expect(screen.getByText('Aufgabe')).toBeInTheDocument();
  });

  it('marks active chips with aria-pressed', () => {
    render(<FilterChipBar chips={mockChips} filters={activeFilters} onToggle={vi.fn()} onClear={vi.fn()} />);
    const activeChip = screen.getByText('Aktiv').closest('button');
    expect(activeChip).toHaveAttribute('aria-pressed', 'true');
    const archiveChip = screen.getByText('Archiv').closest('button');
    expect(archiveChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onToggle with group and value when clicked', () => {
    const onToggle = vi.fn();
    render(<FilterChipBar chips={mockChips} filters={activeFilters} onToggle={onToggle} onClear={vi.fn()} />);
    fireEvent.click(screen.getByText('Archiv'));
    expect(onToggle).toHaveBeenCalledWith('status', 'archived');
  });

  it('shows clear button when activeCount > 0', () => {
    render(<FilterChipBar chips={mockChips} filters={activeFilters} onToggle={vi.fn()} onClear={vi.fn()} activeCount={2} />);
    expect(screen.getByLabelText(/filter/i)).toBeInTheDocument();
  });

  it('does not show clear button when activeCount is 0', () => {
    render(<FilterChipBar chips={mockChips} filters={activeFilters} onToggle={vi.fn()} onClear={vi.fn()} activeCount={0} />);
    expect(screen.queryByLabelText(/filter/i)).not.toBeInTheDocument();
  });

  it('has horizontal scrollable container with role', () => {
    render(<FilterChipBar chips={mockChips} filters={activeFilters} onToggle={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('groups chips visually with separators between groups', () => {
    const { container } = render(<FilterChipBar chips={mockChips} filters={activeFilters} onToggle={vi.fn()} onClear={vi.fn()} />);
    const separators = container.querySelectorAll('.filter-chip-bar__separator');
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });
});
