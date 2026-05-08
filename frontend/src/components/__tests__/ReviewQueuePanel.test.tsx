/**
 * Unit Tests for ReviewQueuePanel - Enhanced FSRS Review UI
 *
 * Tests:
 * - Grade buttons rendering
 * - Keyboard shortcuts (1-5)
 * - Empty state
 * - Retention chart SVG rendering
 * - Review calendar cells
 * - Difficulty gauge
 * - Countdown text
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mock hooks ────────────────────────────────────────────────────────

const mockMutate = vi.fn();
let mockQueueData: any[] = [];
let mockStatsData: any = null;
let mockRetentionData: any = null;
let mockQueueLoading = false;
let mockQueueError = false;

vi.mock('../../hooks/queries/useCognitiveData', () => ({
  useReviewQueue: () => ({
    data: mockQueueData,
    isLoading: mockQueueLoading,
    isError: mockQueueError,
    refetch: vi.fn(),
  }),
  useFSRSStats: () => ({
    data: mockStatsData,
    isLoading: false,
    isError: false,
  }),
  useSubmitReview: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useRetentionCurve: () => ({
    data: mockRetentionData,
    isLoading: false,
  }),
}));

// Mock CSS import
vi.mock('../MyAIPage/CognitiveDashboard.css', () => ({}));

import { ReviewQueuePanel } from '../MyAIPage/ReviewQueuePanel';

// ── Test data ─────────────────────────────────────────────────────────

const sampleFact = {
  id: 'fact-1',
  content: 'Die Hauptstadt von Frankreich ist Paris.',
  domain: 'geography',
  confidence: 0.85,
  fsrs_difficulty: 4.2,
  fsrs_stability: 12.5,
  fsrs_next_review: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
};

const sampleStats = {
  totalWithFSRS: 42,
  dueToday: 5,
  avgDifficulty: 4.8,
  avgStability: 8.3,
};

const sampleRetention = {
  factId: 'fact-1',
  difficulty: 4.2,
  stability: 12.5,
  nextReview: sampleFact.fsrs_next_review,
  curvePoints: Array.from({ length: 31 }, (_, i) => ({
    day: i,
    retention: Math.round(Math.exp(-i / 12.5) * 10000) / 10000,
  })),
};

const defaultProps = {
  context: 'operations' as const,
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('ReviewQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueData = [sampleFact];
    mockStatsData = sampleStats;
    mockRetentionData = sampleRetention;
    mockQueueLoading = false;
    mockQueueError = false;
  });

  it('renders 5 grade buttons when a fact is available', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    const grades = screen.getByTestId('review-grades');
    const buttons = grades.querySelectorAll('button');
    expect(buttons.length).toBe(5);
    expect(screen.getByText('1 - Vergessen')).toBeInTheDocument();
    expect(screen.getByText('2 - Schwer')).toBeInTheDocument();
    expect(screen.getByText('3 - Okay')).toBeInTheDocument();
    expect(screen.getByText('4 - Leicht')).toBeInTheDocument();
    expect(screen.getByText('5 - Perfekt')).toBeInTheDocument();
  });

  it('fires grade submission on keyboard event', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    fireEvent.keyDown(window, { key: '3' });
    expect(mockMutate).toHaveBeenCalledWith(
      { factId: 'fact-1', grade: 3 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('fires grade submission for key 1', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(mockMutate).toHaveBeenCalledWith(
      { factId: 'fact-1', grade: 1 },
      expect.any(Object),
    );
  });

  it('does not fire for non-grade keys', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    fireEvent.keyDown(window, { key: '0' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: '6' });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows empty state when queue is empty', () => {
    mockQueueData = [];
    render(<ReviewQueuePanel {...defaultProps} />);
    const emptyState = screen.getByTestId('review-empty-state');
    expect(emptyState).toBeInTheDocument();
    expect(screen.getByText('Alles aufgefrischt!')).toBeInTheDocument();
    expect(screen.getByText('Keine Fakten zur Wiederholung fällig.')).toBeInTheDocument();
  });

  it('renders retention chart SVG when fact and data available', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    const chart = screen.getByRole('img', { name: 'Behaltenskurve' });
    expect(chart).toBeInTheDocument();
    const svg = chart.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders review calendar with 28 day cells', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    const grid = screen.getByTestId('review-calendar-grid');
    // 7 headers + 28 day cells = 35 children
    const cells = grid.querySelectorAll('.review-calendar-cell');
    expect(cells.length).toBe(28);
  });

  it('renders difficulty gauge for current fact', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    const gauge = screen.getByTestId('difficulty-gauge');
    expect(gauge).toBeInTheDocument();
    const svg = gauge.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Should show the difficulty value
    expect(gauge.textContent).toContain('4.2');
  });

  it('shows countdown text for upcoming review', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    // The fact is 3 days away
    expect(screen.getByText(/Nächste Wiederholung in 3 Tagen/)).toBeInTheDocument();
  });

  it('shows overdue text for past review dates', () => {
    mockQueueData = [{
      ...sampleFact,
      fsrs_next_review: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    }];
    render(<ReviewQueuePanel {...defaultProps} />);
    expect(screen.getByText(/Überfällig seit 2 Tagen/)).toBeInTheDocument();
  });

  it('renders stats dashboard with metric cards', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Heute fällig')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('8.3')).toBeInTheDocument();
  });

  it('shows keyboard hint', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    expect(screen.getByText('Tastenkürzel: 1-5')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockQueueLoading = true;
    render(<ReviewQueuePanel {...defaultProps} />);
    expect(screen.getByText('Lade Wiederholungsaufgaben...')).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    mockQueueError = true;
    render(<ReviewQueuePanel {...defaultProps} />);
    expect(screen.getByText('Wiederholungsdaten nicht verfügbar.')).toBeInTheDocument();
    expect(screen.getByText('Erneut versuchen')).toBeInTheDocument();
  });

  it('clicking grade button calls mutate', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    fireEvent.click(screen.getByText('4 - Leicht'));
    expect(mockMutate).toHaveBeenCalledWith(
      { factId: 'fact-1', grade: 4 },
      expect.any(Object),
    );
  });

  it('does not render retention chart when no fact', () => {
    mockQueueData = [];
    mockRetentionData = null;
    render(<ReviewQueuePanel {...defaultProps} />);
    expect(screen.queryByRole('img', { name: 'Behaltenskurve' })).not.toBeInTheDocument();
  });

  it('renders the fact content text', () => {
    render(<ReviewQueuePanel {...defaultProps} />);
    expect(screen.getByText('Die Hauptstadt von Frankreich ist Paris.')).toBeInTheDocument();
  });
});
