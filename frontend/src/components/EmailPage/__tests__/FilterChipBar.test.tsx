import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChipBar } from '../FilterChipBar';
import { INBOX_FOLDER_CHIPS, INBOX_STATUS_CHIPS, INBOX_CATEGORY_CHIPS, DEFAULT_INBOX_FILTERS } from '../types';
import type { InboxFilters } from '../types';

const allChips = [...INBOX_FOLDER_CHIPS, ...INBOX_STATUS_CHIPS, ...INBOX_CATEGORY_CHIPS];

describe('FilterChipBar', () => {
  it('renders all chips', () => {
    render(
      <FilterChipBar
        chips={allChips}
        filters={DEFAULT_INBOX_FILTERS}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={0}
      />
    );
    for (const chip of allChips) {
      expect(screen.getByText(chip.label)).toBeInTheDocument();
    }
  });

  it('clicking a chip calls onToggle with the chip', () => {
    const onToggle = vi.fn();
    render(
      <FilterChipBar
        chips={allChips}
        filters={DEFAULT_INBOX_FILTERS}
        onToggle={onToggle}
        onClear={vi.fn()}
        activeCount={0}
      />
    );
    fireEvent.click(screen.getByText(INBOX_FOLDER_CHIPS[0].label));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(INBOX_FOLDER_CHIPS[0]);
  });

  it('active chip has aria-pressed="true"', () => {
    const activeFilters: InboxFilters = {
      ...DEFAULT_INBOX_FILTERS,
      folders: new Set(['inbox']),
    };
    render(
      <FilterChipBar
        chips={allChips}
        filters={activeFilters}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={1}
      />
    );
    const inboxChip = screen.getByText('Eingang').closest('button');
    expect(inboxChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('inactive chip has aria-pressed="false"', () => {
    render(
      <FilterChipBar
        chips={allChips}
        filters={DEFAULT_INBOX_FILTERS}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={0}
      />
    );
    const inboxChip = screen.getByText('Eingang').closest('button');
    expect(inboxChip).toHaveAttribute('aria-pressed', 'false');
  });

  it('clear button shows when activeCount > 0', () => {
    render(
      <FilterChipBar
        chips={allChips}
        filters={DEFAULT_INBOX_FILTERS}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={2}
      />
    );
    expect(screen.getByLabelText('Alle Filter entfernen')).toBeInTheDocument();
  });

  it('clear button is hidden when activeCount === 0', () => {
    render(
      <FilterChipBar
        chips={allChips}
        filters={DEFAULT_INBOX_FILTERS}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={0}
      />
    );
    expect(screen.queryByLabelText('Alle Filter entfernen')).not.toBeInTheDocument();
  });

  it('clicking the clear button calls onClear', () => {
    const onClear = vi.fn();
    render(
      <FilterChipBar
        chips={allChips}
        filters={DEFAULT_INBOX_FILTERS}
        onToggle={vi.fn()}
        onClear={onClear}
        activeCount={1}
      />
    );
    fireEvent.click(screen.getByLabelText('Alle Filter entfernen'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('chip groups have separators between them', () => {
    const { container } = render(
      <FilterChipBar
        chips={allChips}
        filters={DEFAULT_INBOX_FILTERS}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        activeCount={0}
      />
    );
    const separators = container.querySelectorAll('.inbox-chip-separator');
    // 3 groups → 2 separators between them
    expect(separators.length).toBe(2);
  });
});
