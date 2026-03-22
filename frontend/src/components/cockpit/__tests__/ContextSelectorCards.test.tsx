import { render, screen, fireEvent } from '@testing-library/react';
import { ContextSelectorCards } from '../ContextSelectorCards';

describe('ContextSelectorCards', () => {
  const onSelect = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  it('renders 4 context cards', () => {
    render(<ContextSelectorCards onSelect={onSelect} />);
    expect(screen.getByText('Persoenlich')).toBeInTheDocument();
    expect(screen.getByText('Arbeit')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
    expect(screen.getByText('Kreativ')).toBeInTheDocument();
  });

  it('calls onSelect with context when card clicked', () => {
    render(<ContextSelectorCards onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Arbeit'));
    expect(onSelect).toHaveBeenCalledWith('work');
  });

  it('shows descriptions', () => {
    render(<ContextSelectorCards onSelect={onSelect} />);
    expect(screen.getByText(/Projekte, Meetings/)).toBeInTheDocument();
  });
});
