import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCockpitSessions, STORAGE_KEY, MAX_VISIBLE } from '../../hooks/useCockpitSessions';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock logger/sentry to avoid import side-effects
vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../services/sentry', () => ({
  captureException: vi.fn(),
}));

describe('useCockpitSessions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -----------------------------------------------
  // 1. Auto-creates session on first launch
  // -----------------------------------------------
  it('auto-creates a session on first launch when no sessions exist', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { id: 'server-1', title: 'Neuer Chat' } },
    });

    const { result } = renderHook(() => useCockpitSessions('personal'));

    // Wait for the auto-create useEffect
    await vi.waitFor(() => {
      expect(result.current.sessions.length).toBe(1);
    });

    expect(result.current.sessions[0].id).toBe('server-1');
    expect(result.current.activeSessionId).toBe('server-1');
    expect(mockedAxios.post).toHaveBeenCalledWith('/api/personal/chat/sessions', { type: 'general' });
  });

  // -----------------------------------------------
  // 2. Restores from localStorage
  // -----------------------------------------------
  it('restores sessions from localStorage on mount', () => {
    const stored = {
      sessions: [
        { id: 'stored-1', title: 'Restored' },
        { id: 'stored-2', title: 'Second' },
      ],
      activeSessionId: 'stored-2',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[0].id).toBe('stored-1');
    expect(result.current.activeSessionId).toBe('stored-2');
  });

  // -----------------------------------------------
  // 3. Creates new session and adds tab
  // -----------------------------------------------
  it('creates a new session via API and adds it', async () => {
    // Seed with one session so auto-create doesn't fire
    const stored = {
      sessions: [{ id: 'existing-1', title: 'Existing' }],
      activeSessionId: 'existing-1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { id: 'new-1', title: 'Neuer Chat' } },
    });

    const { result } = renderHook(() => useCockpitSessions('work'));

    let newId: string | undefined;
    await act(async () => {
      newId = await result.current.createSession();
    });

    expect(newId).toBe('new-1');
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.activeSessionId).toBe('new-1');
    expect(mockedAxios.post).toHaveBeenCalledWith('/api/work/chat/sessions', { type: 'general' });
  });

  it('creates a local-only session on API failure', async () => {
    const stored = {
      sessions: [{ id: 'existing-1', title: 'Existing' }],
      activeSessionId: 'existing-1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    mockedAxios.post.mockRejectedValueOnce(new Error('Network Error'));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    let newId: string | undefined;
    await act(async () => {
      newId = await result.current.createSession();
    });

    expect(newId).toBeTruthy();
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.activeSessionId).toBe(newId);
  });

  // -----------------------------------------------
  // 4. Switches session by id
  // -----------------------------------------------
  it('switches session by id', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
      activeSessionId: 's1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.switchSession('s2');
    });

    expect(result.current.activeSessionId).toBe('s2');
  });

  // -----------------------------------------------
  // 5. switchToPrev wraps around to last
  // -----------------------------------------------
  it('switchToPrev wraps around to last session', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
        { id: 's3', title: 'C' },
      ],
      activeSessionId: 's1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.switchToPrev();
    });

    expect(result.current.activeSessionId).toBe('s3');
  });

  it('switchToPrev navigates to previous session', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
      activeSessionId: 's2',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.switchToPrev();
    });

    expect(result.current.activeSessionId).toBe('s1');
  });

  // -----------------------------------------------
  // 6. switchToNext wraps around to first
  // -----------------------------------------------
  it('switchToNext wraps around to first session', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
        { id: 's3', title: 'C' },
      ],
      activeSessionId: 's3',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.switchToNext();
    });

    expect(result.current.activeSessionId).toBe('s1');
  });

  it('switchToNext navigates to next session', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
      activeSessionId: 's1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.switchToNext();
    });

    expect(result.current.activeSessionId).toBe('s2');
  });

  // -----------------------------------------------
  // 7. Closes session and activates next
  // -----------------------------------------------
  it('closes a session and activates the next one', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
        { id: 's3', title: 'C' },
      ],
      activeSessionId: 's2',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.closeSession('s2');
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions.map(s => s.id)).toEqual(['s1', 's3']);
    // Should activate the next session (s3)
    expect(result.current.activeSessionId).toBe('s3');
  });

  it('closes last session in list and activates the previous one', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
      activeSessionId: 's2',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.closeSession('s2');
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.activeSessionId).toBe('s1');
  });

  it('closes a non-active session without changing active', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
        { id: 's3', title: 'C' },
      ],
      activeSessionId: 's1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.closeSession('s3');
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.activeSessionId).toBe('s1');
  });

  // -----------------------------------------------
  // 8. Prevents closing last session
  // -----------------------------------------------
  it('prevents closing the last session', () => {
    const stored = {
      sessions: [{ id: 'only-1', title: 'Only' }],
      activeSessionId: 'only-1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.closeSession('only-1');
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('only-1');
    expect(result.current.activeSessionId).toBe('only-1');
  });

  // -----------------------------------------------
  // 9. Persists to localStorage on every change
  // -----------------------------------------------
  it('persists to localStorage on every state change', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
      activeSessionId: 's1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    act(() => {
      result.current.switchSession('s2');
    });

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.activeSessionId).toBe('s2');
    expect(persisted.sessions).toHaveLength(2);
  });

  // -----------------------------------------------
  // 10. visibleSessions limits to MAX_VISIBLE (8)
  // -----------------------------------------------
  it('visibleSessions returns last MAX_VISIBLE sessions', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`,
      title: `Session ${i}`,
    }));
    const stored = {
      sessions,
      activeSessionId: 's0',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    expect(result.current.sessions).toHaveLength(12);
    expect(result.current.visibleSessions).toHaveLength(MAX_VISIBLE);
    // Should be the last 8 sessions
    expect(result.current.visibleSessions[0].id).toBe('s4');
    expect(result.current.visibleSessions[MAX_VISIBLE - 1].id).toBe('s11');
  });

  it('visibleSessions returns all if fewer than MAX_VISIBLE', () => {
    const stored = {
      sessions: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
      activeSessionId: 's1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    expect(result.current.visibleSessions).toHaveLength(2);
  });

  // -----------------------------------------------
  // Edge cases
  // -----------------------------------------------
  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');

    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { id: 'fresh-1', title: 'Neuer Chat' } },
    });

    const { result } = renderHook(() => useCockpitSessions('personal'));

    // Should auto-create since corrupted data means no sessions
    await vi.waitFor(() => {
      expect(result.current.sessions.length).toBe(1);
    });
  });

  it('auto-creates local session when API fails on first launch', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Server down'));

    const { result } = renderHook(() => useCockpitSessions('personal'));

    await vi.waitFor(() => {
      expect(result.current.sessions.length).toBe(1);
    });

    expect(result.current.sessions[0].id).toBeTruthy();
    expect(result.current.activeSessionId).toBeTruthy();
  });
});
