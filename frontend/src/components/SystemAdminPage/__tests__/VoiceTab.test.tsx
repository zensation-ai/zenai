/**
 * Sprint 1.13: VoiceTab — live provider health + latency tiles +
 * breaker reset.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceTab } from '../VoiceTab';

vi.mock('../../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton" />,
}));

vi.mock('../../../utils/apiConfig', () => ({
  getApiBaseUrl: () => '',
  getApiFetchHeaders: () => ({}),
}));

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  }) as unknown as Promise<Response>;
}

const healthyStatus = {
  success: true,
  data: {
    stt: {
      available: ['whisper', 'deepgram'],
      default: 'whisper',
      breaker: {},
      breakerConfig: { failureThreshold: 3, cooldownMs: 60_000 },
    },
    tts: {
      available: ['elevenlabs', 'edge-tts'],
      default: 'elevenlabs',
      cache: { size: 5, maxEntries: 100 },
      breaker: {},
      breakerConfig: { failureThreshold: 3, cooldownMs: 60_000 },
    },
    latency: {
      audio_ingest: { count: 10, p50: 30, p95: 50, max: 80, mean: 35 },
      stt: { count: 10, p50: 120, p95: 200, max: 300, mean: 140 },
      llm: { count: 10, p50: 400, p95: 600, max: 900, mean: 450 },
      tts: { count: 10, p50: 200, p95: 350, max: 500, mean: 220 },
      end_to_end: { count: 10, p50: 800, p95: 1200, max: 1800, mean: 900 },
    },
    windowMs: 300_000,
  },
};

const degradedStatus = {
  success: true,
  data: {
    stt: {
      available: ['whisper', 'deepgram'],
      default: 'whisper',
      breaker: {
        deepgram: { failures: 0, openUntil: Date.now() + 30_000, isOpen: true, remainingCooldownMs: 30_000 },
      },
      breakerConfig: { failureThreshold: 3, cooldownMs: 60_000 },
    },
    tts: {
      available: ['elevenlabs', 'edge-tts'],
      default: 'elevenlabs',
      cache: { size: 5, maxEntries: 100 },
      breaker: {},
      breakerConfig: { failureThreshold: 3, cooldownMs: 60_000 },
    },
    latency: {
      audio_ingest: { count: 0, p50: 0, p95: 0, max: 0, mean: 0 },
      stt: { count: 0, p50: 0, p95: 0, max: 0, mean: 0 },
      llm: { count: 0, p50: 0, p95: 0, max: 0, mean: 0 },
      tts: { count: 0, p50: 0, p95: 0, max: 0, mean: 0 },
      end_to_end: { count: 2, p50: 1600, p95: 2200, max: 2400, mean: 1800 },
    },
    windowMs: 300_000,
  },
};

describe('VoiceTab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeleton before the first fetch resolves', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => { /* never resolves */ }),
    );
    render(<VoiceTab />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('renders latency tiles for all five phases', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(healthyStatus));
    render(<VoiceTab />);
    await waitFor(() => expect(screen.getByTestId('voice-admin-tab')).toBeInTheDocument());
    expect(screen.getByTestId('latency-tile-Audio Ingest')).toBeInTheDocument();
    expect(screen.getByTestId('latency-tile-STT')).toBeInTheDocument();
    expect(screen.getByTestId('latency-tile-LLM')).toBeInTheDocument();
    expect(screen.getByTestId('latency-tile-TTS')).toBeInTheDocument();
    expect(screen.getByTestId('latency-tile-End-to-End')).toBeInTheDocument();
  });

  it('renders one row per known provider plus the default badge', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(healthyStatus));
    render(<VoiceTab />);
    await waitFor(() =>
      expect(screen.getByTestId('stt-provider-row-whisper')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('stt-provider-row-deepgram')).toBeInTheDocument();
    expect(screen.getByTestId('tts-provider-row-elevenlabs')).toBeInTheDocument();
    expect(screen.getByTestId('tts-provider-row-edge-tts')).toBeInTheDocument();
  });

  it('marks a breaker-open provider with OFFEN badge', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(degradedStatus));
    render(<VoiceTab />);
    await waitFor(() =>
      expect(screen.getByTestId('stt-breaker-state-deepgram')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('stt-breaker-state-deepgram')).toHaveTextContent('OFFEN');
  });

  it('enables reset button only for breakers that exist', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(degradedStatus));
    render(<VoiceTab />);
    await waitFor(() =>
      expect(screen.getByTestId('stt-breaker-reset-deepgram')).toBeInTheDocument(),
    );
    const active = screen.getByTestId('stt-breaker-reset-deepgram') as HTMLButtonElement;
    const inactive = screen.getByTestId('stt-breaker-reset-whisper') as HTMLButtonElement;
    expect(active.disabled).toBe(false);
    expect(inactive.disabled).toBe(true);
  });

  it('POSTs to the reset endpoint when clicking reset', async () => {
    const fetchSpy = vi.fn();
    fetchSpy.mockImplementationOnce(() => jsonResponse(degradedStatus));
    fetchSpy.mockImplementationOnce(() => jsonResponse({ success: true, data: {} }));
    fetchSpy.mockImplementationOnce(() => jsonResponse(healthyStatus));
    global.fetch = fetchSpy;

    render(<VoiceTab />);
    await waitFor(() =>
      expect(screen.getByTestId('stt-breaker-reset-deepgram')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('stt-breaker-reset-deepgram'));

    await waitFor(() => {
      const resetCall = fetchSpy.mock.calls.find(([url]) =>
        String(url).includes('/api/voice/admin/breaker/stt/deepgram/reset'),
      );
      expect(resetCall).toBeDefined();
      expect(resetCall![1].method).toBe('POST');
    });
  });

  it('shows an error state when the initial fetch fails', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(() => jsonResponse({ error: 'upstream down' }, { ok: false, status: 500 }));
    render(<VoiceTab />);
    await waitFor(() => {
      expect(screen.getByText(/Fehler beim Laden/)).toBeInTheDocument();
    });
  });

  it('surfaces the cache stats for TTS', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse(healthyStatus));
    render(<VoiceTab />);
    await waitFor(() => expect(screen.getByTestId('voice-admin-tab')).toBeInTheDocument());
    expect(screen.getByText(/TTS Phrase-Cache/)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });
});
