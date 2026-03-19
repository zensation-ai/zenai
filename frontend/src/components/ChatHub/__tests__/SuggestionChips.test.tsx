// frontend/src/components/ChatHub/__tests__/SuggestionChips.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionChips } from '../SuggestionChips';

describe('SuggestionChips', () => {
  const chips = [
    { id: '1', label: 'Was steht heute an?', prompt: 'Was steht heute auf meinem Terminplan?' },
    { id: '2', label: 'Ungelesene E-Mails', prompt: 'Zeige mir meine ungelesenen E-Mails' },
    { id: '3', label: 'Letzte Idee fortsetzen', prompt: 'Lass uns an meiner letzten Idee weiterarbeiten' },
  ];

  const defaultProps = {
    chips,
    visible: true,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chips when visible', () => {
    render(<SuggestionChips {...defaultProps} />);
    expect(screen.getByText('Was steht heute an?')).toBeInTheDocument();
    expect(screen.getByText('Ungelesene E-Mails')).toBeInTheDocument();
    expect(screen.getByText('Letzte Idee fortsetzen')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    const { container } = render(<SuggestionChips {...defaultProps} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onSelect with prompt when chip is clicked', () => {
    render(<SuggestionChips {...defaultProps} />);
    fireEvent.click(screen.getByText('Ungelesene E-Mails'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Zeige mir meine ungelesenen E-Mails');
  });

  it('supports keyboard navigation with arrow keys', () => {
    render(<SuggestionChips {...defaultProps} />);
    const firstChip = screen.getByText('Was steht heute an?');
    firstChip.focus();
    fireEvent.keyDown(firstChip, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByText('Ungelesene E-Mails'));
  });

  it('wraps keyboard navigation from last to first', () => {
    render(<SuggestionChips {...defaultProps} />);
    const lastChip = screen.getByText('Letzte Idee fortsetzen');
    lastChip.focus();
    fireEvent.keyDown(lastChip, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByText('Was steht heute an?'));
  });

  it('selects chip on Enter key', () => {
    render(<SuggestionChips {...defaultProps} />);
    const chip = screen.getByText('Was steht heute an?');
    chip.focus();
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Was steht heute auf meinem Terminplan?');
  });

  it('has accessible list role', () => {
    render(<SuggestionChips {...defaultProps} />);
    expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'Vorschlaege');
  });
});
