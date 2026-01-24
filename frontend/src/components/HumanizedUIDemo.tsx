/**
 * Humanized UI Demo Component
 *
 * Zeigt alle humanisierten UI-Komponenten in Aktion.
 * Kann als Referenz für die Integration in andere Komponenten dienen.
 *
 * Usage:
 * - In Development: Direkt als Route oder in Storybook einbinden
 * - In Production: Als Referenz für die Verwendung der Komponenten
 */

import { useState, useEffect } from 'react';
import {
  EnhancedTooltip,
  ContextualLoader,
  SkeletonLoader,
  SuccessAnimation,
  AIStatusIndicator,
  HumanizedEmptyState,
  FriendlyError,
  ProgressToast,
  ConnectionStatus,
} from './HumanizedUI';
import {
  getProgressPraise,
  getRandomPlaceholder,
  type UserProgress,
} from '../utils/humanizedMessages';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import './HumanizedUI.css';

export const HumanizedUIDemo = () => {
  // Demo States
  const [aiStatus, setAiStatus] = useState<'idle' | 'listening' | 'thinking' | 'processing' | 'success' | 'error'>('idle');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAction, setSuccessAction] = useState<'archive' | 'save' | 'publish'>('save');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'syncing'>('connected');
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const [placeholder, setPlaceholder] = useState(getRandomPlaceholder('ideaInput'));

  // Demo User Progress
  const [userProgress] = useState<UserProgress>({
    ideasToday: 5,
    ideasThisWeek: 23,
    totalIdeas: 87,
    streakDays: 7,
    archivedToday: 3,
    connectionsFound: 12,
    lastActiveDate: new Date().toISOString(),
  });

  // Simulate AI status cycle
  const cycleAIStatus = () => {
    const statuses: Array<typeof aiStatus> = ['listening', 'thinking', 'processing', 'success'];
    let index = 0;

    const interval = setInterval(() => {
      if (index < statuses.length) {
        setAiStatus(statuses[index]);
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => setAiStatus('idle'), 1500);
      }
    }, 1500);
  };

  // Simulate progress upload
  const simulateProgress = () => {
    setShowProgress(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setShowProgress(false), 2000);
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 300);
  };

  // Rotate placeholder
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholder(getRandomPlaceholder('ideaInput'));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const greeting = getTimeBasedGreeting();
  const progressPraise = getProgressPraise(userProgress);

  return (
    <div className="humanized-ui-demo" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '3rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span>{greeting.emoji}</span>
          Humanized UI Demo
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          {greeting.greeting} {greeting.subtext}
        </p>
        {progressPraise && (
          <p className="neuro-motivational" style={{ marginTop: '1rem', color: 'var(--neuro-reward)' }}>
            {progressPraise}
          </p>
        )}
      </header>

      {/* Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>

        {/* ============================================
            ENHANCED TOOLTIPS
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Enhanced Tooltips</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Tooltips mit Aktion, Shortcut und kontextueller Hilfe
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <EnhancedTooltip tooltipId="newIdea">
              <button className="neuro-button">Neue Idee</button>
            </EnhancedTooltip>

            <EnhancedTooltip tooltipId="voice">
              <button className="neuro-button" style={{ background: 'var(--neuro-anticipation)' }}>
                🎙️ Sprache
              </button>
            </EnhancedTooltip>

            <EnhancedTooltip tooltipId="archiveIdea">
              <button className="neuro-button" style={{ background: 'var(--neuro-success)' }}>
                Archivieren
              </button>
            </EnhancedTooltip>

            <EnhancedTooltip
              content={{
                label: 'Custom Tooltip',
                action: 'Zeigt wie custom content funktioniert',
                shortcut: 'Cmd+X',
                hint: 'Du kannst auch eigene Inhalte definieren!',
              }}
            >
              <button className="neuro-button" style={{ background: 'var(--neuro-focus)' }}>
                Custom
              </button>
            </EnhancedTooltip>
          </div>
        </section>

        {/* ============================================
            AI STATUS INDICATOR
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>AI Status Indicator</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Animierte Anzeige des KI-Zustands
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <AIStatusIndicator status={aiStatus} size="large" />

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="neuro-button"
                onClick={cycleAIStatus}
                style={{ fontSize: '0.8125rem', padding: '0.5rem 1rem' }}
              >
                Zyklus starten
              </button>
              <button
                onClick={() => setAiStatus('error')}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
              >
                Error simulieren
              </button>
            </div>
          </div>
        </section>

        {/* ============================================
            SUCCESS ANIMATIONS
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Success Animations</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Feedback bei erfolgreichen Aktionen
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {(['save', 'archive', 'publish'] as const).map(action => (
              <button
                key={action}
                className="neuro-button"
                style={{ fontSize: '0.8125rem', padding: '0.5rem 1rem' }}
                onClick={() => {
                  setSuccessAction(action);
                  setShowSuccess(true);
                }}
              >
                {action === 'save' && '💾 Speichern'}
                {action === 'archive' && '📦 Archivieren'}
                {action === 'publish' && '🚀 Veröffentlichen'}
              </button>
            ))}
          </div>

          <SuccessAnimation
            show={showSuccess}
            action={successAction}
            onComplete={() => setShowSuccess(false)}
          />
        </section>

        {/* ============================================
            CONNECTION STATUS
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Connection Status</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Verständliche Verbindungsanzeige
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <ConnectionStatus
              status={connectionStatus}
              lastSync={new Date(Date.now() - 5 * 60 * 1000)}
              showDetails
            />

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['connected', 'connecting', 'syncing'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setConnectionStatus(status)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '6px',
                    border: connectionStatus === status ? '2px solid var(--neuro-reward)' : '1px solid var(--border-color)',
                    background: connectionStatus === status ? 'var(--neuro-reward-pulse)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================
            CONTEXTUAL LOADERS
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Contextual Loaders</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Loading-States mit kontextuellen Nachrichten
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <ContextualLoader context={{ type: 'ai' }} size="small" inline />
            <ContextualLoader context={{ type: 'search' }} size="small" inline />
            <ContextualLoader context={{ type: 'sync' }} size="small" inline />
          </div>
        </section>

        {/* ============================================
            SKELETON LOADERS
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Skeleton Loaders</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            WCAG-konforme Skeleton-Animationen (stoppen nach 5s)
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <SkeletonLoader type="avatar" />
              <div style={{ flex: 1 }}>
                <SkeletonLoader type="heading" />
                <div style={{ marginTop: '0.5rem' }}>
                  <SkeletonLoader type="text" count={2} />
                </div>
              </div>
            </div>
            <SkeletonLoader type="card" height="80px" />
          </div>
        </section>

        {/* ============================================
            PROGRESS TOAST
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Progress Toast</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Nicht-blockierender Fortschritt
          </p>

          <button className="neuro-button" onClick={simulateProgress}>
            Upload simulieren
          </button>

          <ProgressToast
            show={showProgress}
            progress={Math.min(progress, 100)}
            message="Datei wird hochgeladen..."
            subMessage="bild.png"
            onCancel={() => setShowProgress(false)}
          />
        </section>

        {/* ============================================
            EMPTY STATES
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Humanized Empty States</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Inspirierende leere Zustände
          </p>

          <HumanizedEmptyState
            type="ideas"
            size="small"
            onAction={() => alert('Aktion ausgeführt!')}
          />
        </section>

        {/* ============================================
            FRIENDLY ERRORS
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Friendly Errors</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Freundliche, lösungsorientierte Fehlermeldungen
          </p>

          <FriendlyError
            errorType="network"
            variant="inline"
            onRetry={() => alert('Retry!')}
            onDismiss={() => {}}
          />
        </section>

        {/* ============================================
            PLACEHOLDER DEMO
            ============================================ */}
        <section className="liquid-glass" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Inspirierende Placeholders</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Variable Placeholder-Texte (rotieren alle 5s)
          </p>

          <input
            type="text"
            className="liquid-glass-input neuro-placeholder-animated"
            placeholder={placeholder}
            style={{ width: '100%' }}
          />
        </section>

      </div>

      {/* CSS Klassen Demo */}
      <section style={{ marginTop: '3rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>CSS Utility Classes</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="neuro-chunk neuro-hover-lift">
            <code>.neuro-hover-lift</code>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Hover für Lift-Effekt
            </p>
          </div>

          <div className="neuro-chunk neuro-heartbeat">
            <code>.neuro-heartbeat</code>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Pulsierender Heartbeat
            </p>
          </div>

          <div className="neuro-chunk">
            <span className="neuro-status-dot online" style={{ marginRight: '0.5rem' }} />
            <code>.neuro-status-dot.online</code>
          </div>

          <div className="neuro-chunk">
            <span className="neuro-status-dot busy" style={{ marginRight: '0.5rem' }} />
            <code>.neuro-status-dot.busy</code>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HumanizedUIDemo;
