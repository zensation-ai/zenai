import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeaCard2 } from '../IdeaCard2';
import type { StructuredIdea } from '../../../types';

const mockIdea: StructuredIdea = {
  id: '1',
  title: 'Test Idea',
  type: 'idea',
  category: 'business',
  priority: 'high',
  summary: 'A test idea summary',
  next_steps: ['Step 1'],
  context_needed: [],
  keywords: ['test', 'idea'],
  is_favorite: false,
  created_at: new Date().toISOString(),
};

describe('IdeaCard2', () => {
  it('renders title and summary', () => {
    render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} />);
    expect(screen.getByText('Test Idea')).toBeInTheDocument();
    expect(screen.getByText('A test idea summary')).toBeInTheDocument();
  });

  it('renders priority badge', () => {
    render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} />);
    expect(screen.getByText(/hoch/i)).toBeInTheDocument();
  });

  it('renders keyword chips', () => {
    render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} />);
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('idea')).toBeInTheDocument();
  });

  it('calls onClick with idea when clicked', () => {
    const onClick = vi.fn();
    render(<IdeaCard2 idea={mockIdea} onClick={onClick} />);
    fireEvent.click(screen.getByText('Test Idea'));
    expect(onClick).toHaveBeenCalledWith(mockIdea);
  });

  it('shows selection checkbox when selectionMode', () => {
    render(
      <IdeaCard2
        idea={mockIdea}
        onClick={vi.fn()}
        selectionMode
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('adapts layout for list view via data-view', () => {
    const { container } = render(<IdeaCard2 idea={mockIdea} onClick={vi.fn()} view="list" />);
    expect(container.firstChild).toHaveAttribute('data-view', 'list');
  });

  it('shows favorite indicator when is_favorite', () => {
    const favIdea = { ...mockIdea, is_favorite: true };
    render(<IdeaCard2 idea={favIdea} onClick={vi.fn()} />);
    expect(screen.getByLabelText(/favorit/i)).toBeInTheDocument();
  });
});
