import { render, screen, fireEvent } from '@testing-library/react';
import { CockpitBottomBar } from '../CockpitBottomBar';
import type { PanelState } from '../../../contexts/PanelContext';

// Mock PanelContext
const mockDispatch = vi.fn();
let mockState: PanelState = { activePanel: null, pinned: false, width: 420 };

vi.mock('../../../contexts/PanelContext', () => ({
  usePanelContext: () => ({ state: mockState, dispatch: mockDispatch }),
}));

describe('CockpitBottomBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { activePanel: null, pinned: false, width: 420 };
  });

  it('renders 5 bottom bar items (4 primary + Mehr)', () => {
    render(<CockpitBottomBar />);
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Ideen')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Kalender')).toBeInTheDocument();
    expect(screen.getByLabelText('Mehr')).toBeInTheDocument();
  });

  it('highlights active item with indicator class', () => {
    mockState = { activePanel: null, pinned: false, width: 420 };
    render(<CockpitBottomBar />);
    // Chat is active when no panel is open
    expect(screen.getByLabelText('Chat')).toHaveClass('cockpit-bottom-bar__item--active');
    expect(screen.getByLabelText('Ideen')).not.toHaveClass('cockpit-bottom-bar__item--active');
  });

  it('dispatches OPEN_PANEL on panel item click', () => {
    render(<CockpitBottomBar />);
    fireEvent.click(screen.getByLabelText('Ideen'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'OPEN_PANEL', panel: 'ideas' });
  });

  it('dispatches CLOSE_PANEL on Chat click', () => {
    mockState = { activePanel: 'email', pinned: false, width: 420 };
    render(<CockpitBottomBar />);
    fireEvent.click(screen.getByLabelText('Chat'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLOSE_PANEL' });
  });

  it('has proper accessibility labels', () => {
    mockState = { activePanel: 'email', pinned: false, width: 420 };
    render(<CockpitBottomBar />);
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    expect(nav).toBeInTheDocument();

    const emailBtn = screen.getByLabelText('Email');
    expect(emailBtn).toHaveAttribute('aria-current', 'page');

    const chatBtn = screen.getByLabelText('Chat');
    expect(chatBtn).not.toHaveAttribute('aria-current');
  });

  it('opens more sheet when Mehr is clicked', () => {
    render(<CockpitBottomBar />);
    const moreBtn = screen.getByLabelText('Mehr');
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(moreBtn);
    expect(screen.getByRole('menu', { name: 'Weitere Navigation' })).toBeInTheDocument();
    expect(screen.getByText('Dokumente')).toBeInTheDocument();
    expect(screen.getByText('Finanzen')).toBeInTheDocument();
    expect(screen.getByText('Gedaechtnis')).toBeInTheDocument();
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  it('switches active indicator when panel changes', () => {
    mockState = { activePanel: null, pinned: false, width: 420 };
    const { rerender } = render(<CockpitBottomBar />);
    expect(screen.getByLabelText('Chat')).toHaveClass('cockpit-bottom-bar__item--active');

    mockState = { activePanel: 'email', pinned: false, width: 420 };
    rerender(<CockpitBottomBar />);
    expect(screen.getByLabelText('Email')).toHaveClass('cockpit-bottom-bar__item--active');
    expect(screen.getByLabelText('Chat')).not.toHaveClass('cockpit-bottom-bar__item--active');
  });
});
