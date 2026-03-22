import { render, screen, act } from '@testing-library/react';
import { ShortcutHint } from '../ShortcutHint';

describe('ShortcutHint', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
  afterEach(() => vi.useRealTimers());

  it('renders hint text', () => {
    render(<ShortcutHint message="Tipp: Cmd+1 oeffnet Aufgaben" visible={true} />);
    expect(screen.getByText(/Cmd\+1/)).toBeInTheDocument();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<ShortcutHint message="Tipp" visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('auto-dismisses after 3 seconds', () => {
    const onDismiss = vi.fn();
    render(<ShortcutHint message="Tipp" visible={true} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onDismiss).toHaveBeenCalled();
  });
});
