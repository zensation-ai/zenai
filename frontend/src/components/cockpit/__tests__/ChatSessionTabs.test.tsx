import { render, screen, fireEvent } from '@testing-library/react';
import { ChatSessionTabs } from '../ChatSessionTabs';

describe('ChatSessionTabs', () => {
  const tabs = [
    { sessionId: 's1', title: 'API Design' },
    { sessionId: 's2', title: 'Deploy Planung' },
  ];

  const defaultProps = {
    tabs,
    activeSessionId: 's1',
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onNewTab: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all tabs', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    expect(screen.getByText('API Design')).toBeInTheDocument();
    expect(screen.getByText('Deploy Planung')).toBeInTheDocument();
  });

  it('marks active tab', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    const tab = screen.getByText('API Design').closest('button');
    expect(tab).toHaveClass('session-tabs__tab--active');
  });

  it('calls onSelectTab when clicking inactive tab', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    fireEvent.click(screen.getByText('Deploy Planung'));
    expect(defaultProps.onSelectTab).toHaveBeenCalledWith('s2');
  });

  it('calls onNewTab when clicking new tab button', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Neuer Chat'));
    expect(defaultProps.onNewTab).toHaveBeenCalled();
  });

  it('calls onCloseTab when clicking close on a tab', () => {
    render(<ChatSessionTabs {...defaultProps} />);
    const closeBtns = screen.getAllByLabelText('Tab schliessen');
    fireEvent.click(closeBtns[0]);
    expect(defaultProps.onCloseTab).toHaveBeenCalledWith('s1');
  });
});
