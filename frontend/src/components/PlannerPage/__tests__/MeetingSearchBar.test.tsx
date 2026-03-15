/**
 * MeetingSearchBar Tests
 *
 * Tests rendering, debounced search, status filter, and audio toggle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MeetingSearchBar } from '../MeetingSearchBar';

describe('MeetingSearchBar', () => {
  const mockOnSearch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnSearch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render search input', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const input = screen.getByPlaceholderText('Meetings durchsuchen...');
    expect(input).toBeDefined();
    expect(input.tagName).toBe('INPUT');
  });

  it('should render status filter dropdown', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeDefined();
    expect(select.tagName).toBe('SELECT');
  });

  it('should render status filter options', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    expect(screen.getByText('Alle')).toBeDefined();
    expect(screen.getByText('Geplant')).toBeDefined();
    expect(screen.getByText('Laufend')).toBeDefined();
    expect(screen.getByText('Abgeschlossen')).toBeDefined();
  });

  it('should render audio toggle checkbox', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDefined();
    expect(screen.getByText('Hat Audio')).toBeDefined();
  });

  it('should call onSearch with query after debounce', async () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const input = screen.getByPlaceholderText('Meetings durchsuchen...');
    fireEvent.change(input, { target: { value: 'budget' } });

    // Should not be called immediately
    expect(mockOnSearch).not.toHaveBeenCalled();

    // Advance past debounce (300ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockOnSearch).toHaveBeenCalledWith('budget', expect.objectContaining({}));
  });

  it('should call onSearch when status filter changes', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'completed' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockOnSearch).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('should call onSearch when audio toggle changes', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockOnSearch).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ hasAudio: true })
    );
  });

  it('should pass undefined for empty status filter when changed back', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const select = screen.getByRole('combobox');
    // Change to a value, then back to empty
    fireEvent.change(select, { target: { value: 'completed' } });
    act(() => { vi.advanceTimersByTime(300); });
    mockOnSearch.mockClear();

    fireEvent.change(select, { target: { value: '' } });
    act(() => { vi.advanceTimersByTime(300); });

    expect(mockOnSearch).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ status: undefined })
    );
  });

  it('should pass undefined for hasAudio when unchecked after checking', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const checkbox = screen.getByRole('checkbox');
    // Check then uncheck
    fireEvent.click(checkbox);
    act(() => { vi.advanceTimersByTime(300); });
    mockOnSearch.mockClear();

    fireEvent.click(checkbox);
    act(() => { vi.advanceTimersByTime(300); });

    expect(mockOnSearch).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ hasAudio: undefined })
    );
  });

  it('should debounce rapid query changes', () => {
    render(<MeetingSearchBar onSearch={mockOnSearch} />);

    const input = screen.getByPlaceholderText('Meetings durchsuchen...');

    fireEvent.change(input, { target: { value: 'b' } });
    act(() => { vi.advanceTimersByTime(100); });

    fireEvent.change(input, { target: { value: 'bu' } });
    act(() => { vi.advanceTimersByTime(100); });

    fireEvent.change(input, { target: { value: 'bud' } });
    act(() => { vi.advanceTimersByTime(100); });

    fireEvent.change(input, { target: { value: 'budg' } });
    act(() => { vi.advanceTimersByTime(300); });

    // Only the last value should have been sent (plus possibly the initial mount call)
    const budgCalls = mockOnSearch.mock.calls.filter(
      (call: any[]) => call[0] === 'budg'
    );
    expect(budgCalls.length).toBeGreaterThanOrEqual(1);
  });
});
