/**
 * Unit tests for the <DemoWelcome /> onboarding card.
 *
 * The component is gated by `localStorage.zenai_demo === 'true'` and talks to
 * /api/demo/{status,seed,reset} via axios. We mock both.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- axios mock ------------------------------------------------------------
vi.mock('axios', () => {
  const get = vi.fn();
  const post = vi.fn();
  const del = vi.fn();
  return {
    default: { get, post, delete: del },
    get,
    post,
    delete: del,
  };
});

import axios from 'axios';
import { DemoWelcome } from '../DemoWelcome';

const mockedGet = axios.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = axios.post as unknown as ReturnType<typeof vi.fn>;
const mockedDelete = axios.delete as unknown as ReturnType<typeof vi.fn>;

const STATUS_EMPTY = {
  success: true,
  persona: 'Alex Chen',
  userId: '00000000-0000-0000-0000-000000000003',
  seeded: false,
  counts: { coreBlocks: 0, topics: 0, ideas: 0, facts: 0, episodes: 0 },
  expected: { coreBlocks: 4, topics: 10, ideas: 30, facts: 150, episodes: 200 },
};

const STATUS_SEEDED = {
  ...STATUS_EMPTY,
  seeded: true,
  counts: { coreBlocks: 4, topics: 10, ideas: 30, facts: 150, episodes: 200 },
};

function enableDemoSession() {
  localStorage.setItem('zenai_demo', 'true');
  localStorage.removeItem('zenai_demo_welcome_dismissed');
}

describe('<DemoWelcome />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders nothing when not in a demo session', () => {
    const { container } = render(<DemoWelcome />);
    expect(container.firstChild).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('renders nothing when the user has dismissed the card', () => {
    enableDemoSession();
    localStorage.setItem('zenai_demo_welcome_dismissed', 'true');
    const { container } = render(<DemoWelcome />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the load CTA when status reports unseeded', async () => {
    enableDemoSession();
    mockedGet.mockResolvedValueOnce({ data: STATUS_EMPTY });

    render(<DemoWelcome />);

    expect(await screen.findByTestId('demo-welcome')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /Alex Chen-Daten laden/i }),
    ).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/api/demo/status');
  });

  it('shows the reset CTA + counts when already seeded', async () => {
    enableDemoSession();
    mockedGet.mockResolvedValueOnce({ data: STATUS_SEEDED });

    render(<DemoWelcome />);

    expect(
      await screen.findByRole('button', { name: /Demo zurücksetzen/i }),
    ).toBeInTheDocument();
    // 30 ideas / 150 facts / 200 episodes appear in the body copy
    expect(screen.getByText(/30 Ideen/)).toBeInTheDocument();
    expect(screen.getByText(/150 gelernte Fakten/)).toBeInTheDocument();
  });

  it('seeds the demo on click and refreshes status', async () => {
    enableDemoSession();
    mockedGet
      .mockResolvedValueOnce({ data: STATUS_EMPTY })
      .mockResolvedValueOnce({ data: STATUS_SEEDED });
    mockedPost.mockResolvedValueOnce({ data: { success: true } });

    render(<DemoWelcome />);
    const user = userEvent.setup();

    const loadBtn = await screen.findByRole('button', {
      name: /Alex Chen-Daten laden/i,
    });
    await user.click(loadBtn);

    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/api/demo/seed'));
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole('button', { name: /Demo zurücksetzen/i }),
    ).toBeInTheDocument();
  });

  it('resets the demo on click and refreshes status', async () => {
    enableDemoSession();
    mockedGet
      .mockResolvedValueOnce({ data: STATUS_SEEDED })
      .mockResolvedValueOnce({ data: STATUS_EMPTY });
    mockedDelete.mockResolvedValueOnce({ data: { success: true } });

    render(<DemoWelcome />);
    const user = userEvent.setup();

    const resetBtn = await screen.findByRole('button', {
      name: /Demo zurücksetzen/i,
    });
    await user.click(resetBtn);

    await waitFor(() =>
      expect(mockedDelete).toHaveBeenCalledWith('/api/demo/reset'),
    );
    expect(
      await screen.findByRole('button', { name: /Alex Chen-Daten laden/i }),
    ).toBeInTheDocument();
  });

  it('surfaces an error message if the status call fails', async () => {
    enableDemoSession();
    mockedGet.mockRejectedValueOnce(new Error('network down'));

    render(<DemoWelcome />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Status konnte nicht geladen werden/i,
    );
  });

  it('persists dismissal in localStorage and unmounts the card', async () => {
    enableDemoSession();
    mockedGet.mockResolvedValueOnce({ data: STATUS_EMPTY });

    render(<DemoWelcome />);
    const user = userEvent.setup();

    const closeBtn = await screen.findByRole('button', {
      name: /Demo-Begrüßung schließen/i,
    });
    await user.click(closeBtn);

    await waitFor(() =>
      expect(screen.queryByTestId('demo-welcome')).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem('zenai_demo_welcome_dismissed')).toBe('true');
  });
});
