import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Rail } from '../Rail';
import type { PanelState, PanelAction } from '../../../contexts/PanelContext';

// Mock PanelContext
const mockDispatch = vi.fn();
let mockState: PanelState = { activePanel: null, pinned: false, width: 420 };

vi.mock('../../../contexts/PanelContext', () => ({
  usePanelContext: () => ({ state: mockState, dispatch: mockDispatch }),
}));

describe('Rail', () => {
  const defaultProps = {
    context: 'personal' as const,
    onContextChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { activePanel: null, pinned: false, width: 420 };
  });

  const renderRail = (props = {}) =>
    render(
      <MemoryRouter>
        <Rail {...defaultProps} {...props} />
      </MemoryRouter>
    );

  it('renders all 8 navigation items', () => {
    renderRail();
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Ideen')).toBeInTheDocument();
    expect(screen.getByLabelText('Kalender')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Dokumente')).toBeInTheDocument();
    expect(screen.getByLabelText('Finanzen')).toBeInTheDocument();
    expect(screen.getByLabelText('Gedaechtnis')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('marks chat as active when no panel is open', () => {
    mockState = { activePanel: null, pinned: false, width: 420 };
    renderRail();
    expect(screen.getByLabelText('Chat').closest('button')).toHaveClass('rail__item--active');
  });

  it('marks panel as active when panel is open', () => {
    mockState = { activePanel: 'ideas', pinned: false, width: 420 };
    renderRail();
    expect(screen.getByLabelText('Ideen').closest('button')).toHaveClass('rail__item--active');
    expect(screen.getByLabelText('Chat').closest('button')).not.toHaveClass('rail__item--active');
  });

  it('dispatches OPEN_PANEL when clicking a panel item', () => {
    renderRail();
    fireEvent.click(screen.getByLabelText('Ideen'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'OPEN_PANEL', panel: 'ideas' });
  });

  it('dispatches CLOSE_PANEL when clicking Chat', () => {
    mockState = { activePanel: 'ideas', pinned: false, width: 420 };
    renderRail();
    fireEvent.click(screen.getByLabelText('Chat'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLOSE_PANEL' });
  });

  it('renders context switcher', () => {
    renderRail();
    expect(screen.getByLabelText('Kontext wechseln')).toBeInTheDocument();
  });

  it('cycles context on context button click', () => {
    const onContextChange = vi.fn();
    renderRail({ onContextChange });
    fireEvent.click(screen.getByLabelText('Kontext wechseln'));
    expect(onContextChange).toHaveBeenCalledWith('work');
  });
});
