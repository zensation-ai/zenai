/**
 * RatingPromptToast tests
 *
 * Sprint 1.11 — covers all three eligibility states + submit + id-parser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import {
  RatingPromptToast,
  parseOriginalBlueprintId,
  type RatingEligibility,
} from '../RatingPromptToast';

vi.mock('axios');
vi.mock('../../../utils/errors', () => ({ logError: vi.fn() }));

const mockedAxios = vi.mocked(axios, true);

const baseEligible: RatingEligibility = {
  eligible: true,
  installed: true,
  alreadyRated: false,
  existingRating: null,
  existingReview: null,
  executionCount: 5,
  executionsRequired: 3,
};

describe('RatingPromptToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "not installed" message when blueprint is not installed', () => {
    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        eligibilityOverride={{ ...baseEligible, installed: false, eligible: false }}
      />,
    );
    expect(screen.getByTestId('rating-not-installed')).toBeInTheDocument();
  });

  it('shows remaining-runs hint when installed but not enough executions', () => {
    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        eligibilityOverride={{ ...baseEligible, eligible: false, executionCount: 1 }}
      />,
    );
    expect(screen.getByTestId('rating-need-more-runs')).toHaveTextContent(/Noch 2 Ausführung/);
  });

  it('renders 5 star buttons when eligible', () => {
    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        eligibilityOverride={baseEligible}
      />,
    );
    for (const s of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`rating-star-${s}`)).toBeInTheDocument();
    }
  });

  it('disables submit until a star is picked', () => {
    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        eligibilityOverride={baseEligible}
      />,
    );
    const submit = screen.getByTestId('rating-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('rating-star-4'));
    expect(submit.disabled).toBe(false);
  });

  it('submits POST /rate with star + review on confirm', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: { data: { id: 'r1' } } });
    const onSubmitted = vi.fn();

    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        onSubmitted={onSubmitted}
        eligibilityOverride={baseEligible}
      />,
    );

    fireEvent.click(screen.getByTestId('rating-star-5'));
    fireEvent.change(screen.getByTestId('rating-review'), { target: { value: 'Great agent' } });
    fireEvent.click(screen.getByTestId('rating-submit'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/marketplace/blueprints/bp-1/rate',
        { rating: 5, review: 'Great agent' },
      );
    });
    expect(onSubmitted).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('rating-success')).toBeInTheDocument());
  });

  it('omits review when empty or whitespace', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });

    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        eligibilityOverride={baseEligible}
      />,
    );

    fireEvent.click(screen.getByTestId('rating-star-3'));
    fireEvent.change(screen.getByTestId('rating-review'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('rating-submit'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/marketplace/blueprints/bp-1/rate',
        { rating: 3 },
      );
    });
  });

  it('pre-fills existing rating and review when already rated', () => {
    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        eligibilityOverride={{
          ...baseEligible,
          eligible: false,
          alreadyRated: true,
          existingRating: 4,
          existingReview: 'Old review',
        }}
      />,
    );
    expect(screen.getByTestId('rating-star-4')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('rating-review')).toHaveValue('Old review');
    expect(screen.getByTestId('rating-submit')).toHaveTextContent(/Aktualisieren/);
  });

  it('shows error message when submit fails', async () => {
    mockedAxios.post = vi.fn().mockRejectedValue(new Error('boom'));

    render(
      <RatingPromptToast
        blueprintId="bp-1"
        onClose={() => {}}
        eligibilityOverride={baseEligible}
      />,
    );

    fireEvent.click(screen.getByTestId('rating-star-2'));
    fireEvent.click(screen.getByTestId('rating-submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Bewertung konnte nicht gespeichert/);
    });
  });
});

describe('parseOriginalBlueprintId', () => {
  it('extracts the original id when the suffix is 8 hex chars', () => {
    expect(parseOriginalBlueprintId('daily_research_abc12345')).toBe('daily_research');
  });

  it('returns null for non-install ids', () => {
    expect(parseOriginalBlueprintId('built_in_research')).toBeNull();
    expect(parseOriginalBlueprintId('short')).toBeNull();
    expect(parseOriginalBlueprintId('suffix_XYZ12345')).toBeNull();
  });
});
