/**
 * PublishConfirmModal tests — Sprint 1.12
 *
 * Covers tool-sharing review, description validation, tag parsing,
 * confirm-checkbox gating, and error mapping for 422/429/409 responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { PublishConfirmModal } from '../PublishConfirmModal';
import type { PublishCandidate } from '../types';

vi.mock('axios');
vi.mock('../../../utils/errors', () => ({ logError: vi.fn() }));

const mockedAxios = vi.mocked(axios, true);

const candidate: PublishCandidate = {
  blueprintId: 'bp-1',
  name: 'Daily Research',
  description: null,
  category: 'research',
  tags: ['daily'],
  icon: '🔍',
  tools: ['web_search', 'fetch_url'],
  approvalRequired: true,
  maxActionsPerDay: 10,
  tokenBudgetDaily: 50000,
};

const validDescription = 'A'.repeat(60);

describe('PublishConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders each tool chip so the owner sees what will be shared', () => {
    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );
    expect(screen.getByTestId('publish-tool-web_search')).toBeInTheDocument();
    expect(screen.getByTestId('publish-tool-fetch_url')).toBeInTheDocument();
    expect(screen.getByText(/Tools, die andere sehen \(2\)/)).toBeInTheDocument();
  });

  it('disables submit until confirm-checkbox is checked', () => {
    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );
    const submit = screen.getByTestId('publish-confirm-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('publish-confirm-checkbox'));
    expect(submit.disabled).toBe(false);
  });

  it('blocks submit when description length is between 1 and 49 chars', () => {
    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );
    fireEvent.change(screen.getByTestId('publish-description'), { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('publish-confirm-checkbox'));

    const submit = screen.getByTestId('publish-confirm-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/Beschreibung muss zwischen 50 und 500 Zeichen liegen/)).toBeInTheDocument();
  });

  it('posts description/category/tags and calls onPublished', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: { success: true, status: 'pending' } });
    const onPublished = vi.fn();

    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={onPublished}
        candidateOverride={candidate}
      />,
    );

    fireEvent.change(screen.getByTestId('publish-description'), {
      target: { value: validDescription },
    });
    fireEvent.change(screen.getByTestId('publish-tags'), { target: { value: 'alpha, beta' } });
    fireEvent.change(screen.getByTestId('publish-category'), { target: { value: 'productivity' } });
    fireEvent.click(screen.getByTestId('publish-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('publish-confirm-submit'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/marketplace/blueprints/publish',
        {
          blueprintId: 'bp-1',
          description: validDescription,
          category: 'productivity',
          tags: ['alpha', 'beta'],
        },
      );
      expect(onPublished).toHaveBeenCalled();
    });
  });

  it('truncates tags input to 5 entries on preview', () => {
    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );
    fireEvent.change(screen.getByTestId('publish-tags'), {
      target: { value: '1, 2, 3, 4, 5, 6, 7' },
    });
    // Only the first 5 tags should render as chips
    ['1', '2', '3', '4', '5'].forEach(tag => {
      expect(screen.getByText(tag)).toBeInTheDocument();
    });
  });

  it('omits description when it would fail the 50-char minimum on the backend', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: { success: true, status: 'pending' } });

    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );

    // Leave description empty — it should NOT be in the payload at all.
    fireEvent.click(screen.getByTestId('publish-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('publish-confirm-submit'));

    await waitFor(() => {
      const payload = (mockedAxios.post as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
        description?: string;
      };
      expect(payload.description).toBeUndefined();
    });
  });

  it('maps 429 response to rate-limit error message', async () => {
    mockedAxios.post = vi
      .fn()
      .mockRejectedValue({ response: { status: 429, data: { code: 'PUBLISH_RATE_LIMIT' } } });

    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );
    fireEvent.click(screen.getByTestId('publish-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('publish-confirm-submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Limit erreicht/);
    });
  });

  it('maps 409 response to duplicate error message', async () => {
    mockedAxios.post = vi
      .fn()
      .mockRejectedValue({ response: { status: 409, data: { code: 'PUBLISH_DUPLICATE' } } });

    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );
    fireEvent.click(screen.getByTestId('publish-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('publish-confirm-submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/ähnlicher Agent/);
    });
  });

  it('maps 422 moderation block to explanatory message', async () => {
    mockedAxios.post = vi
      .fn()
      .mockRejectedValue({ response: { status: 422, data: { reason: 'spam' } } });

    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
        candidateOverride={candidate}
      />,
    );
    fireEvent.click(screen.getByTestId('publish-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('publish-confirm-submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/moderationsseitig blockiert/);
      expect(screen.getByRole('alert')).toHaveTextContent(/spam/);
    });
  });

  it('loads candidate from API when override is not provided', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: { data: candidate } });

    render(
      <PublishConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/api/marketplace/blueprints/bp-1/publish-candidate',
      );
      expect(screen.getByTestId('publish-tool-web_search')).toBeInTheDocument();
    });
  });
});
