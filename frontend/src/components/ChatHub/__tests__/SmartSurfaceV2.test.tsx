// frontend/src/components/ChatHub/__tests__/SmartSurfaceV2.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmartSurfaceV2 } from '../SmartSurfaceV2';

// Mock the useSmartSuggestions hook
vi.mock('../../../hooks/useSmartSuggestions', () => ({
  useSmartSuggestions: vi.fn(),
  isMorningBriefingTime: vi.fn(() => false),
  getTimeOfDay: vi.fn(() => 'morning'),
  getDayOfWeek: vi.fn(() => 'monday'),
}));

import { useSmartSuggestions } from '../../../hooks/useSmartSuggestions';
const mockUseSmartSuggestions = vi.mocked(useSmartSuggestions);

const baseSuggestion = {
  userId: 'u1',
  metadata: {},
  priority: 1,
  status: 'active',
  snoozedUntil: null,
  dismissedAt: null,
  createdAt: new Date().toISOString(),
};

describe('SmartSurfaceV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there are no suggestions', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    const { container } = render(<SmartSurfaceV2 context="personal" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while loading (no skeleton, no placeholder)', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [],
      loading: true,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    const { container } = render(<SmartSurfaceV2 context="personal" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders max 3 cards with staggered animation delays', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: '1', type: 'task_reminder', title: 'Task 1', description: 'Do it' },
        { ...baseSuggestion, id: '2', type: 'email_followup', title: 'Email 1', description: 'Reply' },
        { ...baseSuggestion, id: '3', type: 'meeting_prep', title: 'Meeting', description: 'Prep' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);

    // Verify staggered animation delay (0ms, 100ms, 200ms)
    expect(cards[0].style.animationDelay).toBe('0ms');
    expect(cards[1].style.animationDelay).toBe('100ms');
    expect(cards[2].style.animationDelay).toBe('200ms');
  });

  it('has aria-live region for accessibility', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: '1', type: 'task_reminder', title: 'Task 1', description: 'Do it' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    const liveRegion = screen.getByRole('region');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-label', 'Proaktive Vorschlaege');
  });

  it('calls dismiss when dismiss button is clicked', () => {
    const dismissFn = vi.fn();
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: 'abc', type: 'task_reminder', title: 'Task', description: 'Do' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: dismissFn,
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    const dismissBtn = screen.getByLabelText('Verwerfen');
    fireEvent.click(dismissBtn);
    expect(dismissFn).toHaveBeenCalledWith('abc');
  });

  it('truncates to max 3 cards even when more suggestions exist', () => {
    mockUseSmartSuggestions.mockReturnValue({
      suggestions: [
        { ...baseSuggestion, id: '1', type: 'a', title: 'A', description: '' },
        { ...baseSuggestion, id: '2', type: 'b', title: 'B', description: '' },
        { ...baseSuggestion, id: '3', type: 'c', title: 'C', description: '' },
        { ...baseSuggestion, id: '4', type: 'd', title: 'D', description: '' },
      ],
      loading: false,
      timeOfDay: 'morning',
      dismiss: vi.fn(),
      snooze: vi.fn(),
      accept: vi.fn(),
      refresh: vi.fn(),
    });

    render(<SmartSurfaceV2 context="personal" />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });
});
