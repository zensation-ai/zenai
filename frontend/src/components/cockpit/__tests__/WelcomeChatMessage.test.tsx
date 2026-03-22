import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeChatMessage } from '../WelcomeChatMessage';

describe('WelcomeChatMessage', () => {
  const defaultProps = { onSendMessage: vi.fn(), onOpenCommandPalette: vi.fn() };
  beforeEach(() => vi.clearAllMocks());

  it('renders welcome text', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    expect(screen.getByText(/Willkommen bei ZenAI/)).toBeInTheDocument();
  });

  it('renders suggestion chips', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    expect(screen.getByText('Zeig mir meine Aufgaben')).toBeInTheDocument();
    expect(screen.getByText('Schreib eine Email')).toBeInTheDocument();
  });

  it('sends message when chip clicked', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    fireEvent.click(screen.getByText('Zeig mir meine Aufgaben'));
    expect(defaultProps.onSendMessage).toHaveBeenCalledWith('Zeig mir meine Aufgaben');
  });

  it('opens command palette when shortcut chip clicked', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    fireEvent.click(screen.getByText(/alle Befehle/));
    expect(defaultProps.onOpenCommandPalette).toHaveBeenCalled();
  });
});
