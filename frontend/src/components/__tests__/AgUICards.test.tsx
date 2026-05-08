/**
 * Unit Tests for AgUICards Component
 *
 * Tests AG-UI card rendering including hypothesis, approval,
 * insight, and pipeline cards.
 *
 * @module tests/components/AgUICards
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgUICards } from '../GeneralChat/AgUICards';
import type { AgUICard } from '../../hooks/useAgUIState';

describe('AgUICards Component', () => {
  const makeCard = (overrides: Partial<AgUICard> = {}): AgUICard => ({
    id: 'test-1',
    type: 'hypothesis_card',
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  });

  it('renders nothing when no cards and no pipeline status', () => {
    const { container } = render(
      <AgUICards cards={[]} pipelineStatus={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders hypothesis card with badge text', () => {
    const card = makeCard({
      type: 'hypothesis_card',
      payload: { hypothesis: 'Test hypothesis', confidence: 0.85, evidence: 'Strong evidence' },
    });

    render(<AgUICards cards={[card]} pipelineStatus={null} />);

    expect(screen.getByText('Hypothese')).toBeInTheDocument();
    expect(screen.getByText('Test hypothesis')).toBeInTheDocument();
    expect(screen.getByText('Konfidenz: 85%')).toBeInTheDocument();
    expect(screen.getByText('Evidenz: Strong evidence')).toBeInTheDocument();
  });

  it('renders approval card with approve/reject buttons', () => {
    const card = makeCard({
      id: 'approval-1',
      type: 'approval_request',
      payload: { action: 'delete_memory', description: 'Delete old memories', risk: 'medium' },
    });

    render(<AgUICards cards={[card]} pipelineStatus={null} />);

    expect(screen.getByText('Genehmigung erforderlich')).toBeInTheDocument();
    expect(screen.getByText('Delete old memories')).toBeInTheDocument();
    expect(screen.getByText('Genehmigen')).toBeInTheDocument();
    expect(screen.getByText('Ablehnen')).toBeInTheDocument();
  });

  it('renders insight card', () => {
    const card = makeCard({
      id: 'insight-1',
      type: 'cognitive_insight',
      payload: { insight: 'A new pattern was detected', source: 'curiosity_engine' },
    });

    render(<AgUICards cards={[card]} pipelineStatus={null} />);

    expect(screen.getByText('Erkenntnis')).toBeInTheDocument();
    expect(screen.getByText('A new pattern was detected')).toBeInTheDocument();
    expect(screen.getByText('Quelle: curiosity_engine')).toBeInTheDocument();
  });

  it('renders pipeline card with step indicators', () => {
    const pipelineStatus = {
      steps: {
        rag: { status: 'complete' },
        thinking: { status: 'running' },
        tools: { status: 'pending' },
      },
    };

    render(<AgUICards cards={[]} pipelineStatus={pipelineStatus} />);

    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('rag')).toBeInTheDocument();
    expect(screen.getByText('thinking')).toBeInTheDocument();
    expect(screen.getByText('tools')).toBeInTheDocument();
  });

  it('dismiss button calls onDismiss with card id', () => {
    const onDismiss = vi.fn();
    const card = makeCard({
      id: 'dismiss-test',
      type: 'hypothesis_card',
      payload: { hypothesis: 'Test' },
    });

    render(<AgUICards cards={[card]} pipelineStatus={null} onDismiss={onDismiss} />);

    const dismissButton = screen.getByRole('button', { name: /schlie/i });
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledWith('dismiss-test');
  });

  it('renders multiple cards simultaneously', () => {
    const cards: AgUICard[] = [
      makeCard({ id: 'h1', type: 'hypothesis_card', payload: { hypothesis: 'Hypo 1' } }),
      makeCard({ id: 'i1', type: 'cognitive_insight', payload: { insight: 'Insight 1' } }),
    ];

    render(<AgUICards cards={cards} pipelineStatus={null} />);

    expect(screen.getByText('Hypo 1')).toBeInTheDocument();
    expect(screen.getByText('Insight 1')).toBeInTheDocument();
  });

  it('renders pipeline card alongside other cards', () => {
    const card = makeCard({
      type: 'hypothesis_card',
      payload: { hypothesis: 'Test' },
    });
    const pipelineStatus = { steps: { rag: { status: 'complete' } } };

    render(<AgUICards cards={[card]} pipelineStatus={pipelineStatus} />);

    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Hypothese')).toBeInTheDocument();
  });

  it('does not show dismiss button when onDismiss is not provided', () => {
    const card = makeCard({
      type: 'hypothesis_card',
      payload: { hypothesis: 'Test' },
    });

    render(<AgUICards cards={[card]} pipelineStatus={null} />);

    expect(screen.queryByRole('button', { name: /schlie/i })).not.toBeInTheDocument();
  });

  it('renders ReviewCard for fsrs_review type', () => {
    const cards: AgUICard[] = [{
      id: 'review-1',
      type: 'fsrs_review',
      payload: { question: 'Was ist HiMeS?', lastReviewed: '2026-03-27' },
      timestamp: Date.now(),
    }];
    render(<AgUICards cards={cards} pipelineStatus={null} />);
    expect(screen.getByText('Wiederholung')).toBeInTheDocument();
    expect(screen.getByText('Was ist HiMeS?')).toBeInTheDocument();
    expect(screen.getByText(/Zuletzt: 2026-03-27/)).toBeInTheDocument();
  });

  it('renders PredictionCard for predicted_intent type', () => {
    const cards: AgUICard[] = [{
      id: 'pred-1',
      type: 'predicted_intent' as AgUICard['type'],
      payload: { intent: 'Recherche', confidence: 0.85 },
      timestamp: Date.now(),
    }];
    render(<AgUICards cards={cards} pipelineStatus={null} />);
    expect(screen.getByText('Vorhersage')).toBeInTheDocument();
    expect(screen.getByText('Recherche')).toBeInTheDocument();
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });
});
