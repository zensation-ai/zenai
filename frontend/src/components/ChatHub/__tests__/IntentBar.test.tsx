// frontend/src/components/ChatHub/__tests__/IntentBar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentBar } from '../IntentBar';

describe('IntentBar', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onFocusChange: vi.fn(),
    sending: false,
    thinkingMode: 'assist' as const,
    onThinkingModeChange: vi.fn(),
    context: 'personal' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a textarea with placeholder', () => {
    render(<IntentBar {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/frag mich|gib mir/i);
    expect(textarea).toBeInTheDocument();
  });

  it('calls onChange when typing', () => {
    render(<IntentBar {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(defaultProps.onChange).toHaveBeenCalledWith('Hello');
  });

  it('calls onSend when send button is clicked', () => {
    render(<IntentBar {...defaultProps} value="Hello" />);
    const sendBtn = screen.getByLabelText('Nachricht senden');
    fireEvent.click(sendBtn);
    expect(defaultProps.onSend).toHaveBeenCalled();
  });

  it('disables send button when value is empty', () => {
    render(<IntentBar {...defaultProps} value="" />);
    const sendBtn = screen.getByLabelText('Nachricht senden');
    expect(sendBtn).toBeDisabled();
  });

  it('disables send button when sending is true', () => {
    render(<IntentBar {...defaultProps} value="Hello" sending={true} />);
    const sendBtn = screen.getByLabelText('Nachricht senden');
    expect(sendBtn).toBeDisabled();
  });

  it('sends on Enter key (without Shift)', () => {
    render(<IntentBar {...defaultProps} value="Hello" />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(defaultProps.onSend).toHaveBeenCalled();
  });

  it('does NOT send on Shift+Enter (allows newline)', () => {
    render(<IntentBar {...defaultProps} value="Hello" />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('renders thinking mode toggle with three options', () => {
    render(<IntentBar {...defaultProps} />);
    expect(screen.getByLabelText(/schnell/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gruendlich/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tief/i)).toBeInTheDocument();
  });

  it('calls onFocusChange when textarea gains/loses focus', () => {
    render(<IntentBar {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);
    expect(defaultProps.onFocusChange).toHaveBeenCalledWith(true);
    fireEvent.blur(textarea);
    expect(defaultProps.onFocusChange).toHaveBeenCalledWith(false);
  });

  it('has accessible send button with aria-label', () => {
    render(<IntentBar {...defaultProps} />);
    expect(screen.getByLabelText('Nachricht senden')).toBeInTheDocument();
  });
});
