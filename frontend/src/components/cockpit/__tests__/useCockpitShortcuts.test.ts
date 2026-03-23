import { renderHook, act } from '@testing-library/react';
import { useCockpitShortcuts } from '../useCockpitShortcuts';
import type { PanelType } from '../../../contexts/PanelContext';

describe('useCockpitShortcuts', () => {
  const onOpenPanel = vi.fn();
  const onClosePanel = vi.fn();
  const onNavigate = vi.fn();
  const onNewTab = vi.fn();
  const onPrevTab = vi.fn();
  const onNextTab = vi.fn();
  const onCloseTab = vi.fn();

  const defaultProps = {
    onOpenPanel,
    onClosePanel,
    onNavigate,
    onNewTab,
    onPrevTab,
    onNextTab,
    onCloseTab,
    enabled: true,
  };

  beforeEach(() => vi.clearAllMocks());

  function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      ...opts,
    });
    document.dispatchEvent(event);
  }

  it('opens panels with Cmd+1 through Cmd+9', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));

    const expectedPanels: PanelType[] = [
      'tasks', 'email', 'ideas', 'calendar', 'contacts',
      'documents', 'memory', 'finance', 'agents',
    ];

    expectedPanels.forEach((panel, i) => {
      act(() => fireKey(String(i + 1), { metaKey: true }));
      expect(onOpenPanel).toHaveBeenCalledWith(panel);
    });

    expect(onOpenPanel).toHaveBeenCalledTimes(9);
  });

  it('opens search panel with Cmd+/', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey('/', { metaKey: true }));
    expect(onOpenPanel).toHaveBeenCalledWith('search');
  });

  it('closes panel with Escape', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey('Escape'));
    expect(onClosePanel).toHaveBeenCalledTimes(1);
  });

  it('navigates to dashboard with Cmd+D', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey('d', { metaKey: true }));
    expect(onNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('navigates to settings with Cmd+,', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey(',', { metaKey: true }));
    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });

  it('creates new tab with Cmd+T', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey('t', { metaKey: true }));
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  it('switches to prev tab with Cmd+[', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey('[', { metaKey: true }));
    expect(onPrevTab).toHaveBeenCalledTimes(1);
  });

  it('switches to next tab with Cmd+]', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey(']', { metaKey: true }));
    expect(onNextTab).toHaveBeenCalledTimes(1);
  });

  it('closes tab with Alt+W', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey('w', { altKey: true }));
    expect(onCloseTab).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    renderHook(() => useCockpitShortcuts({ ...defaultProps, enabled: false }));
    act(() => fireKey('1', { metaKey: true }));
    act(() => fireKey('Escape'));
    expect(onOpenPanel).not.toHaveBeenCalled();
    expect(onClosePanel).not.toHaveBeenCalled();
  });

  it('ignores shortcuts when typing in an input', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: input });
    document.dispatchEvent(event);

    // Escape should still work in inputs (close panel is always valid)
    expect(onClosePanel).toHaveBeenCalledTimes(1);

    document.body.removeChild(input);
  });

  it('ignores Cmd+number when typing in input (not Escape)', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: '1',
      metaKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: input });
    document.dispatchEvent(event);

    // Cmd+1 should NOT work in inputs
    expect(onOpenPanel).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('also works with Ctrl key (Windows/Linux)', () => {
    renderHook(() => useCockpitShortcuts(defaultProps));
    act(() => fireKey('1', { ctrlKey: true }));
    expect(onOpenPanel).toHaveBeenCalledWith('tasks');
  });

  it('cleans up listener on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useCockpitShortcuts(defaultProps));
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });
});
