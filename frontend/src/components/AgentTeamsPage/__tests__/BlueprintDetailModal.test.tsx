/**
 * BlueprintDetailModal tests
 *
 * Sprint 1.11 — covers render, tool preview, histogram bars, reviews, install CTA.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlueprintDetailModal } from '../BlueprintDetailModal';
import type { BlueprintDetail } from '../types';

vi.mock('../../../utils/errors', () => ({ logError: vi.fn() }));

const detail: BlueprintDetail = {
  id: 'bp-1',
  name: 'Daily Research',
  description: 'Runs a morning research sweep',
  icon: '🔍',
  category: 'research',
  tags: ['research', 'daily'],
  type: 'autonomous',
  triggers: [],
  maxActionsPerDay: 10,
  tokenBudgetDaily: 50000,
  approvalRequired: true,
  tools: ['web_search', 'fetch_url', 'remember'],
  instructions: 'Search the web for breaking AI news',
  source: 'community',
  rating: 4.3,
  usageCount: 42,
  featured: true,
  histogram: {
    total: 10,
    average: 4.3,
    distribution: { 1: 0, 2: 1, 3: 1, 4: 3, 5: 5 },
  },
  recentReviews: [
    { id: 'r1', rating: 5, review: 'Fantastic', createdAt: '2026-04-18T10:00:00Z' },
    { id: 'r2', rating: 4, review: 'Solid', createdAt: '2026-04-17T10:00:00Z' },
  ],
};

describe('BlueprintDetailModal', () => {
  it('renders header, tools, instructions, and reviews from override', () => {
    render(<BlueprintDetailModal blueprintId="bp-1" onClose={() => {}} detailOverride={detail} />);

    expect(screen.getByText('Daily Research')).toBeInTheDocument();
    expect(screen.getByText(/Runs a morning research sweep/)).toBeInTheDocument();
    expect(screen.getByText(/Tool-Zugriff \(3\)/)).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('fetch_url')).toBeInTheDocument();
    expect(screen.getByText('remember')).toBeInTheDocument();
    expect(screen.getByText(/Search the web for breaking/)).toBeInTheDocument();
    expect(screen.getByText('Fantastic')).toBeInTheDocument();
    expect(screen.getByText('Solid')).toBeInTheDocument();
  });

  it('renders histogram bars for each of the 5 star buckets', () => {
    render(<BlueprintDetailModal blueprintId="bp-1" onClose={() => {}} detailOverride={detail} />);

    for (const star of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`histogram-bar-${star}`)).toBeInTheDocument();
    }
  });

  it('shows the Empfohlen badge when featured', () => {
    render(<BlueprintDetailModal blueprintId="bp-1" onClose={() => {}} detailOverride={detail} />);
    expect(screen.getByText(/Empfohlen/)).toBeInTheDocument();
  });

  it('calls onInstall with the detail when install CTA is clicked', () => {
    const onInstall = vi.fn();
    render(
      <BlueprintDetailModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstall={onInstall}
        detailOverride={detail}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Installieren/ }));
    expect(onInstall).toHaveBeenCalledWith(detail);
  });

  it('does not render install CTA when onInstall is not provided', () => {
    render(<BlueprintDetailModal blueprintId="bp-1" onClose={() => {}} detailOverride={detail} />);
    expect(screen.queryByRole('button', { name: /Installieren/ })).not.toBeInTheDocument();
  });

  it('closes on overlay click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BlueprintDetailModal blueprintId="bp-1" onClose={onClose} detailOverride={detail} />,
    );
    const overlay = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "Noch keine Bewertungen" when histogram is empty', () => {
    const emptyDetail = {
      ...detail,
      histogram: { total: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
      recentReviews: [],
    };
    render(
      <BlueprintDetailModal blueprintId="bp-1" onClose={() => {}} detailOverride={emptyDetail} />,
    );
    expect(screen.getByText(/Noch keine Bewertungen/)).toBeInTheDocument();
  });

  it('shows empty-tools fallback when tools array is empty', () => {
    const noTools = { ...detail, tools: [] };
    render(
      <BlueprintDetailModal blueprintId="bp-1" onClose={() => {}} detailOverride={noTools} />,
    );
    expect(screen.getByText(/Keine externen Tools\./)).toBeInTheDocument();
  });
});
