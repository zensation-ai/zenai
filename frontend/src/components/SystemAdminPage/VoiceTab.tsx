/**
 * Sprint 1.13: Voice-Realtime Production-Hardening admin view.
 *
 * Live STT/TTS provider health + circuit breaker state + phase
 * latency tiles (p50/p95/max). Admin can force-close a breaker
 * after investigating the upstream issue.
 *
 * Refreshes every 5 s; window defaults to the last 5 minutes so
 * tiles react quickly to regressions.
 */

import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, styles, formatDuration } from './admin-shared';

const LATENCY_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5000;
const P95_ALERT_THRESHOLD_MS = 1500;

interface BreakerStatus {
  failures: number;
  openUntil: number;
  isOpen: boolean;
  remainingCooldownMs: number;
}

interface BreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

interface VoiceStatus {
  stt: {
    available: string[];
    default: string;
    breaker: Record<string, BreakerStatus>;
    breakerConfig: BreakerConfig;
  };
  tts: {
    available: string[];
    default: string;
    cache: { size: number; maxEntries: number };
    breaker: Record<string, BreakerStatus>;
    breakerConfig: BreakerConfig;
  };
  latency: {
    audio_ingest: LatencyStats;
    stt: LatencyStats;
    llm: LatencyStats;
    tts: LatencyStats;
    end_to_end: LatencyStats;
  };
  windowMs: number | null;
}

const KNOWN_STT_PROVIDERS = ['whisper', 'deepgram'];
const KNOWN_TTS_PROVIDERS = ['elevenlabs', 'edge-tts'];

const PHASE_LABELS: Record<keyof VoiceStatus['latency'], string> = {
  audio_ingest: 'Audio Ingest',
  stt: 'STT',
  llm: 'LLM',
  tts: 'TTS',
  end_to_end: 'End-to-End',
};

export function VoiceTab() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await apiCall<{ success: boolean; data: VoiceStatus }>(
        `/api/voice/admin/status?windowMs=${LATENCY_WINDOW_MS}`,
      );
      setStatus(res.data);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const resetBreaker = useCallback(
    async (kind: 'stt' | 'tts', provider: string) => {
      const key = `${kind}:${provider}`;
      setActionInFlight(key);
      try {
        await apiCall(`/api/voice/admin/breaker/${kind}/${provider}/reset`, {
          method: 'POST',
        });
        await loadStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reset fehlgeschlagen');
      } finally {
        setActionInFlight(null);
      }
    },
    [loadStatus],
  );

  if (loading && !status) {
    return (
      <div className="voice-tab-loading">
        <SkeletonLoader type="card" count={4} />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div style={{ ...styles.card, color: '#ef4444' }}>
        Fehler beim Laden der Voice-Admin-Daten: {error}
      </div>
    );
  }

  if (!status) return null;

  return (
    <div data-testid="voice-admin-tab">
      {error && (
        <div style={{ ...styles.card, color: '#fbbf24', marginBottom: '12px' }}>
          Hinweis: {error}
        </div>
      )}

      {/* Latency tiles */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          Latenz (letzte 5 min) — SLA p95 &lt; 1.5 s
        </div>
        <div style={styles.grid}>
          {(Object.keys(PHASE_LABELS) as Array<keyof VoiceStatus['latency']>).map((phase) => (
            <LatencyTile
              key={phase}
              label={PHASE_LABELS[phase]}
              stats={status.latency[phase]}
              highlightP95={phase === 'end_to_end'}
            />
          ))}
        </div>
      </div>

      {/* STT providers */}
      <ProviderSection
        kind="stt"
        title="STT-Provider"
        knownProviders={KNOWN_STT_PROVIDERS}
        available={status.stt.available}
        defaultProvider={status.stt.default}
        breakers={status.stt.breaker}
        breakerConfig={status.stt.breakerConfig}
        actionInFlight={actionInFlight}
        onReset={resetBreaker}
      />

      {/* TTS providers */}
      <ProviderSection
        kind="tts"
        title="TTS-Provider"
        knownProviders={KNOWN_TTS_PROVIDERS}
        available={status.tts.available}
        defaultProvider={status.tts.default}
        breakers={status.tts.breaker}
        breakerConfig={status.tts.breakerConfig}
        actionInFlight={actionInFlight}
        onReset={resetBreaker}
      />

      {/* Cache stats */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>TTS Phrase-Cache</div>
        <div style={styles.card}>
          <div>
            Einträge: <strong>{status.tts.cache.size}</strong> /{' '}
            {status.tts.cache.maxEntries}
          </div>
        </div>
      </div>

      {lastFetched && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginTop: '8px' }}>
          Letzter Refresh: {lastFetched.toLocaleTimeString('de-DE')} (alle{' '}
          {REFRESH_INTERVAL_MS / 1000} s)
        </div>
      )}
    </div>
  );
}

interface LatencyTileProps {
  label: string;
  stats: LatencyStats;
  highlightP95: boolean;
}

function LatencyTile({ label, stats, highlightP95 }: LatencyTileProps) {
  const p95Exceeded = highlightP95 && stats.p95 > P95_ALERT_THRESHOLD_MS;

  return (
    <div
      style={{
        ...styles.statCard,
        borderColor: p95Exceeded ? '#ef4444' : undefined,
      }}
      data-testid={`latency-tile-${label}`}
    >
      <div style={{ ...styles.statLabel, fontSize: '11px' }}>{label}</div>
      <div
        style={{
          ...styles.statValue,
          color: p95Exceeded ? '#ef4444' : undefined,
          fontSize: '20px',
        }}
      >
        {stats.count > 0 ? formatDuration(Math.round(stats.p95)) : '–'}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px' }}>
        p95 · n={stats.count}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary, #94a3b8)', marginTop: '6px' }}>
        p50 {stats.count > 0 ? formatDuration(Math.round(stats.p50)) : '–'} ·
        max {stats.count > 0 ? formatDuration(Math.round(stats.max)) : '–'}
      </div>
    </div>
  );
}

interface ProviderSectionProps {
  kind: 'stt' | 'tts';
  title: string;
  knownProviders: string[];
  available: string[];
  defaultProvider: string;
  breakers: Record<string, BreakerStatus>;
  breakerConfig: BreakerConfig;
  actionInFlight: string | null;
  onReset: (kind: 'stt' | 'tts', provider: string) => void;
}

function ProviderSection({
  kind,
  title,
  knownProviders,
  available,
  defaultProvider,
  breakers,
  breakerConfig,
  actionInFlight,
  onReset,
}: ProviderSectionProps) {
  const allProviders = Array.from(new Set([...knownProviders, ...available, ...Object.keys(breakers)]));
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>
        {title}{' '}
        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary, #94a3b8)' }}>
          (Breaker: {breakerConfig.failureThreshold} fails → {breakerConfig.cooldownMs / 1000}s cool-down)
        </span>
      </div>
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Provider</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Breaker</th>
              <th style={styles.th}>Failures</th>
              <th style={styles.th}>Cooldown</th>
              <th style={styles.th}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {allProviders.map((provider) => {
              const isAvailable = available.includes(provider);
              const breaker = breakers[provider];
              const isOpen = breaker?.isOpen ?? false;
              const actionKey = `${kind}:${provider}`;
              return (
                <tr key={provider} data-testid={`${kind}-provider-row-${provider}`}>
                  <td style={styles.td}>
                    <strong>{provider}</strong>
                    {provider === defaultProvider && (
                      <span
                        style={{
                          ...styles.badge('#60a5fa'),
                          marginLeft: '6px',
                        }}
                      >
                        default
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.badge(isAvailable ? '#4ade80' : '#94a3b8')}>
                      {isAvailable ? 'verfügbar' : 'nicht konfiguriert'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={styles.badge(isOpen ? '#ef4444' : breaker ? '#fbbf24' : '#4ade80')}
                      data-testid={`${kind}-breaker-state-${provider}`}
                    >
                      {isOpen ? 'OFFEN' : breaker ? 'WARNEND' : 'geschlossen'}
                    </span>
                  </td>
                  <td style={styles.td}>{breaker?.failures ?? 0}</td>
                  <td style={styles.td}>
                    {isOpen
                      ? `${Math.ceil((breaker?.remainingCooldownMs ?? 0) / 1000)} s`
                      : '–'}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.button}
                      disabled={!breaker || actionInFlight === actionKey}
                      onClick={() => onReset(kind, provider)}
                      data-testid={`${kind}-breaker-reset-${provider}`}
                    >
                      {actionInFlight === actionKey ? '…' : 'Reset'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
