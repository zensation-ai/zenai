import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeaGridView } from '../IdeaGridView';
import { IdeaListView } from '../IdeaListView';
import { IdeaGraphView } from '../IdeaGraphView';

const mockIdea = {
  id: '1',
  title: 'Test Idee',
  summary: 'Eine Zusammenfassung',
  type: 'idea',
  priority: 'medium',
  status: 'active',
  is_favorite: false,
  keywords: ['test'],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

describe('IdeaGridView', () => {
  it('returns null when ideas array is empty', () => {
    const { container } = render(
      <IdeaGridView ideas={[]} onIdeaClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders ideas when provided', () => {
    render(
      <IdeaGridView ideas={[mockIdea as any]} onIdeaClick={vi.fn()} />
    );
    expect(screen.getByText('Test Idee')).toBeInTheDocument();
  });
});

describe('IdeaListView', () => {
  it('returns null when ideas array is empty', () => {
    const { container } = render(
      <IdeaListView ideas={[]} onIdeaClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders ideas when provided', () => {
    render(
      <IdeaListView ideas={[mockIdea as any]} onIdeaClick={vi.fn()} />
    );
    expect(screen.getByText('Test Idee')).toBeInTheDocument();
  });
});

describe('IdeaGraphView', () => {
  it('renders placeholder text', () => {
    render(<IdeaGraphView />);
    expect(screen.getByText('Graph-Ansicht')).toBeInTheDocument();
  });
});
