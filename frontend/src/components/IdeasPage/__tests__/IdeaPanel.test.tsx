import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IdeaPanel } from '../IdeaPanel';

vi.mock('../../IdeaDetail', () => ({
  IdeaDetail: ({ idea, onClose }: any) => (
    <div data-testid="idea-detail">
      <span>{idea.title}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const mockIdea = {
  id: '1', title: 'Test', type: 'idea', category: 'business',
  priority: 'high', summary: 'Test summary', next_steps: [],
  context_needed: [], keywords: [], created_at: new Date().toISOString(),
};

describe('IdeaPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <IdeaPanel open={false} idea={null} onClose={vi.fn()} context="personal" />
    );
    expect(container.querySelector('.idea-panel--open')).toBeNull();
  });

  it('renders idea detail when open with idea', () => {
    render(<IdeaPanel open={true} idea={mockIdea as any} onClose={vi.fn()} context="personal" />);
    expect(screen.getByTestId('idea-detail')).toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(<IdeaPanel open={true} idea={mockIdea as any} onClose={onClose} context="personal" />);
    fireEvent.click(screen.getByTestId('idea-panel-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<IdeaPanel open={true} idea={mockIdea as any} onClose={onClose} context="personal" />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('has aria-label on panel', () => {
    render(<IdeaPanel open={true} idea={mockIdea as any} onClose={vi.fn()} context="personal" />);
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-label');
  });
});
