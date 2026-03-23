import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// ── Mock PanelContext ───────────────────────────────────────────────────
const mockDispatch = vi.fn();
vi.mock('../../../../contexts/PanelContext', () => ({
  usePanelContext: () => ({
    state: { activePanel: 'search', pinned: false, width: 420 },
    dispatch: mockDispatch,
  }),
}));

// ── Mock axios ──────────────────────────────────────────────────────────
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// ── Import component after mocks ────────────────────────────────────────
import SearchPanel from '../SearchPanel';

function renderPanel(props?: Partial<{ context: string; filter?: string }>) {
  return render(
    <SearchPanel
      context={(props?.context ?? 'personal') as 'personal'}
      filter={props?.filter}
      onClose={vi.fn()}
    />
  );
}

const SEARCH_RESULTS = [
  { id: '1', type: 'idea', title: 'Test Idea', snippet: 'A test snippet', score: 0.9 },
  { id: '2', type: 'email', title: 'Test Email', snippet: 'Email body', score: 0.8 },
  { id: '3', type: 'contact', title: 'John Doe', snippet: 'CEO at Acme', score: 0.7 },
  { id: '4', type: 'document', title: 'Doc Alpha', snippet: 'Content...', score: 0.6 },
  { id: '5', type: 'calendar_event', title: 'Team Standup', snippet: 'Daily meeting', score: 0.55 },
  { id: '6', type: 'fact', title: 'Learned fact', snippet: 'AI remembers', score: 0.5 },
  { id: '7', type: 'chat', title: 'Chat message', snippet: 'Old chat', score: 0.4 },
  { id: '8', type: 'transaction', title: 'Payment', snippet: '100 EUR', score: 0.3 },
];

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    mockedAxios.post.mockResolvedValue({ data: { success: true, data: [] } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  it('renders search input with auto-focus', () => {
    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('shows suggestion text when input is empty', () => {
    renderPanel();
    expect(screen.getByText(/Versuche:/)).toBeInTheDocument();
  });

  // ── Debounced Search ──────────────────────────────────────────────────

  it('debounces search by 300ms', async () => {
    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
    });

    // Not called yet (within debounce window)
    expect(mockedAxios.post).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/search/global', expect.objectContaining({
      query: 'test',
      contexts: ['personal'],
      limit: 30,
    }));
  });

  it('does not search if query is less than 2 characters', async () => {
    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
      vi.advanceTimersByTime(350);
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  // ── Results Display ───────────────────────────────────────────────────

  it('displays results grouped by type', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, data: SEARCH_RESULTS },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Idea')).toBeInTheDocument();
      expect(screen.getByText('Test Email')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('shows group headers for result types', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: '1', type: 'idea', title: 'Idea 1' },
          { id: '2', type: 'email', title: 'Email 1' },
        ],
      },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Ideen')).toBeInTheDocument();
      expect(screen.getByText('Emails')).toBeInTheDocument();
    });
  });

  // ── Click to open panel ───────────────────────────────────────────────

  it('dispatches OPEN_PANEL when clicking a result', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: '1', type: 'idea', title: 'My Idea', snippet: 'snip' }],
      },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'idea' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('My Idea')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('My Idea'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      panel: 'ideas',
      filter: 'My Idea',
    });
  });

  it('maps transaction type to finance panel', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: '1', type: 'transaction', title: 'Payment 100' }],
      },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'payment' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Payment 100')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Payment 100'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      panel: 'finance',
      filter: 'Payment 100',
    });
  });

  // ── Keyboard navigation ───────────────────────────────────────────────

  it('supports keyboard navigation with arrow keys', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: '1', type: 'idea', title: 'Idea A' },
          { id: '2', type: 'idea', title: 'Idea B' },
        ],
      },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'idea' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Idea A')).toBeInTheDocument();
    });

    // Arrow down to first result
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Arrow down to second result
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // Enter to open
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      panel: 'ideas',
      filter: 'Idea B',
    });
  });

  it('wraps around when navigating past the last result', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: '1', type: 'idea', title: 'Only Idea' },
        ],
      },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'idea' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Only Idea')).toBeInTheDocument();
    });

    // ArrowDown twice: first to item 0, then wraps to 0 again
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_PANEL', panel: 'ideas' }),
    );
  });

  // ── Loading state ─────────────────────────────────────────────────────

  it('shows loading spinner during search', async () => {
    let resolveSearch!: (value: unknown) => void;
    mockedAxios.post.mockReturnValueOnce(
      new Promise(resolve => { resolveSearch = resolve; }),
    );

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
      vi.advanceTimersByTime(350);
    });

    // Spinner should be visible
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Resolve the search
    await act(async () => {
      resolveSearch({ data: { success: true, data: [] } });
    });
  });

  // ── Error state ───────────────────────────────────────────────────────

  it('shows error message with retry button on failure', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Suche fehlgeschlagen')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /erneut/i })).toBeInTheDocument();
  });

  it('retries search when clicking retry button', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ data: { success: true, data: [{ id: '1', type: 'idea', title: 'Recovered' }] } });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'test' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Suche fehlgeschlagen')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /erneut/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Recovered')).toBeInTheDocument();
    });
  });

  // ── Empty results ─────────────────────────────────────────────────────

  it('shows empty state when search returns no results', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, data: [] },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'nonexistent' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText(/Keine Ergebnisse/)).toBeInTheDocument();
    });
  });

  // ── Recent searches ───────────────────────────────────────────────────

  it('shows recent searches from localStorage as chips', () => {
    localStorage.setItem('zenai-recent-searches', JSON.stringify(['React', 'TypeScript']));

    renderPanel();

    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('clicking a recent search chip fills input and triggers search', async () => {
    localStorage.setItem('zenai-recent-searches', JSON.stringify(['React']));

    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByText('React'));
    });

    const input = screen.getByPlaceholderText('Suche...') as HTMLInputElement;
    expect(input.value).toBe('React');

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/search/global', expect.objectContaining({
      query: 'React',
    }));
  });

  it('saves search term to recent searches on successful search', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, data: [{ id: '1', type: 'idea', title: 'Hit' }] },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'my query' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Hit')).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem('zenai-recent-searches') ?? '[]');
    expect(stored).toContain('my query');
  });

  // ── "Mehr anzeigen" expansion ─────────────────────────────────────────

  it('limits results to 5 per type with expandable "Mehr anzeigen"', async () => {
    const manyIdeas = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      type: 'idea',
      title: `Idea ${i + 1}`,
    }));

    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true, data: manyIdeas },
    });

    renderPanel();
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'idea' } });
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText('Idea 1')).toBeInTheDocument();
      expect(screen.getByText('Idea 5')).toBeInTheDocument();
    });

    // Idea 6 should not be visible yet
    expect(screen.queryByText('Idea 6')).not.toBeInTheDocument();

    // Click "Mehr anzeigen"
    const moreButton = screen.getByText(/Mehr anzeigen/);
    expect(moreButton).toBeInTheDocument();

    fireEvent.click(moreButton);

    expect(screen.getByText('Idea 6')).toBeInTheDocument();
    expect(screen.getByText('Idea 8')).toBeInTheDocument();
  });

  // ── Context forwarding ────────────────────────────────────────────────

  it('passes the current context to the search API', async () => {
    renderPanel({ context: 'work' });
    const input = screen.getByPlaceholderText('Suche...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'report' } });
      vi.advanceTimersByTime(350);
    });

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/search/global', expect.objectContaining({
      contexts: ['work'],
    }));
  });
});
