import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Rail } from '../Rail';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('Rail', () => {
  const defaultProps = {
    currentPage: 'chat' as const,
    context: 'personal' as const,
    onContextChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderRail = (props = {}) =>
    render(
      <MemoryRouter>
        <Rail {...defaultProps} {...props} />
      </MemoryRouter>
    );

  it('renders chat, dashboard, and settings icons', () => {
    renderRail();
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Einstellungen')).toBeInTheDocument();
  });

  it('marks current page as active', () => {
    renderRail({ currentPage: 'chat' });
    expect(screen.getByLabelText('Chat').closest('button')).toHaveClass('rail__item--active');
  });

  it('navigates to dashboard on click', () => {
    renderRail();
    fireEvent.click(screen.getByLabelText('Dashboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('renders context switcher', () => {
    renderRail();
    expect(screen.getByLabelText('Kontext wechseln')).toBeInTheDocument();
  });
});
