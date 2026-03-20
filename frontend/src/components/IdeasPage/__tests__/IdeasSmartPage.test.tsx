import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeasSmartPage } from '../IdeasSmartPage';

vi.mock('../../../hooks/queries/useIdeas', () => ({
  useIdeasQuery: () => ({ data: [], isLoading: false, error: null }),
  useArchivedIdeasQuery: () => ({ data: { ideas: [], total: 0 } }),
  useDeleteIdeaMutation: () => ({ mutate: vi.fn() }),
  useArchiveIdeaMutation: () => ({ mutate: vi.fn() }),
  useRestoreIdeaMutation: () => ({ mutate: vi.fn() }),
  useToggleFavoriteMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(ui);
}

describe('IdeasSmartPage', () => {
  it('renders filter chip bar', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    // FilterChipBar renders with role="toolbar"
    expect(screen.getByRole('toolbar', { name: /chip/i })).toBeInTheDocument();
  });

  it('renders search in toolbar', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    expect(screen.getByPlaceholderText(/suchen/i)).toBeInTheDocument();
  });

  it('renders view toggle', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    expect(screen.getByRole('group', { name: /ansicht/i })).toBeInTheDocument();
  });

  it('renders empty state when no ideas', () => {
    renderWithProviders(<IdeasSmartPage context="personal" />);
    expect(screen.queryByRole('button', { name: /test/i })).not.toBeInTheDocument();
  });

  it('accepts initialTab prop for filter preset', () => {
    renderWithProviders(<IdeasSmartPage context="personal" initialTab="archive" />);
    const archiveChip = screen.getByText('Archiv').closest('button');
    expect(archiveChip).toHaveAttribute('aria-pressed', 'true');
  });
});
