import { useState, useEffect, useMemo, useRef } from 'react';
import './AIBrain.css';

interface AIBrainProps {
  isActive: boolean;
  activityType?: 'thinking' | 'transcribing' | 'searching' | 'processing';
  ideasCount?: number;
  size?: 'small' | 'large';
}

export function AIBrain({ isActive, activityType = 'thinking', ideasCount = 0, size = 'small' }: AIBrainProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [clickFeedback, setClickFeedback] = useState(false);
  const [greeting, setGreeting] = useState('');
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Activity messages - human, empathetic, personal
  const statusMessages: Record<string, string[]> = {
    thinking: [
      'Hmm, lass mich nachdenken...',
      'Interessant! Ich verarbeite das...',
      'Moment, ich sortiere das für dich...',
      'Okay, ich verstehe was du meinst...',
    ],
    transcribing: [
      'Ich höre dir zu...',
      'Erzähl weiter, ich bin ganz Ohr...',
      'Ich fange jedes Wort auf...',
    ],
    searching: [
      'Ich schaue mal in deinen Gedanken...',
      'Moment, ich suche Verbindungen...',
      'Ah, da war doch was Ähnliches...',
    ],
    processing: [
      'Das ist spannend! Ich strukturiere...',
      'Okay, ich bringe das in Form...',
      'Lass mich das für dich aufbereiten...',
      'Ich erkenne Muster hier...',
    ],
  };

  // Dynamic greeting based on time
  useEffect(() => {
    const hour = new Date().getHours();
    let timeGreeting = '';

    if (hour >= 5 && hour < 12) {
      timeGreeting = 'Guten Morgen';
    } else if (hour >= 12 && hour < 17) {
      timeGreeting = 'Guten Tag';
    } else if (hour >= 17 && hour < 21) {
      timeGreeting = 'Guten Abend';
    } else {
      timeGreeting = 'Gute Nacht';
    }

    setGreeting(timeGreeting);
  }, []);

  // Cleanup click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Get random message for variety
  const currentMessage = useMemo(() => {
    const messages = statusMessages[activityType] || statusMessages.thinking;
    return messages[Math.floor(Math.random() * messages.length)];
  }, [activityType, isActive]);

  // Idle tooltip with personality and context
  const idleMessage = useMemo(() => {
    if (ideasCount === 0) {
      return `${greeting}! Ich bin gespannt auf deinen ersten Gedanken 💭`;
    } else if (ideasCount < 5) {
      return `${greeting}! Schon ${ideasCount} Gedanken zusammen – ein guter Start! 🌱`;
    } else if (ideasCount < 20) {
      return `${greeting}! ${ideasCount} Gedanken in deinem Brain. Ich lerne dich kennen! 🧠`;
    } else if (ideasCount < 50) {
      return `${greeting}! Wow, ${ideasCount} Gedanken! Wir sind ein tolles Team 🤝`;
    } else {
      return `${greeting}! ${ideasCount} Gedanken – ich kenne dich richtig gut! ✨`;
    }
  }, [greeting, ideasCount]);

  const handleClick = () => {
    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    setClickFeedback(true);
    clickTimeoutRef.current = setTimeout(() => setClickFeedback(false), 300);
  };

  return (
    <div
      className={`ai-brain-container ${isActive ? 'active' : ''} ${clickFeedback ? 'clicked' : ''} ${size === 'large' ? 'large' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role="status"
      aria-live="polite"
      aria-label={isActive ? currentMessage : idleMessage}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div className="ai-brain-tooltip">
          {isActive ? currentMessage : idleMessage}
        </div>
      )}
      <div className="ai-brain-wrapper">
        {/* Outer glow rings */}
        <div className="brain-glow-ring ring-1" />
        <div className="brain-glow-ring ring-2" />
        <div className="brain-glow-ring ring-3" />

        {/* Brain SVG */}
        <svg
          className="ai-brain-svg"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff6b35" />
              <stop offset="50%" stopColor="#f7931e" />
              <stop offset="100%" stopColor="#ff6b35" />
            </linearGradient>
            <filter id="brainGlow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Brain shape - stylized */}
          <g className="brain-group" filter="url(#brainGlow)">
            {/* Left hemisphere */}
            <path
              className="brain-hemisphere left"
              d="M25 50
                 C25 35, 30 25, 40 22
                 C45 20, 48 22, 50 25
                 C50 30, 48 35, 48 40
                 C48 45, 50 48, 50 50
                 C50 55, 48 60, 45 65
                 C42 70, 38 75, 35 75
                 C28 75, 25 65, 25 50Z"
              fill="url(#brainGradient)"
            />

            {/* Right hemisphere */}
            <path
              className="brain-hemisphere right"
              d="M75 50
                 C75 35, 70 25, 60 22
                 C55 20, 52 22, 50 25
                 C50 30, 52 35, 52 40
                 C52 45, 50 48, 50 50
                 C50 55, 52 60, 55 65
                 C58 70, 62 75, 65 75
                 C72 75, 75 65, 75 50Z"
              fill="url(#brainGradient)"
            />

            {/* Neural connections - left */}
            <path
              className="neural-path path-1"
              d="M30 35 Q35 40, 40 35 Q45 30, 45 40"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              className="neural-path path-2"
              d="M28 50 Q35 55, 42 50 Q48 45, 48 55"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              className="neural-path path-3"
              d="M32 62 Q38 58, 42 62 Q46 66, 44 70"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
              fill="none"
            />

            {/* Neural connections - right */}
            <path
              className="neural-path path-4"
              d="M70 35 Q65 40, 60 35 Q55 30, 55 40"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              className="neural-path path-5"
              d="M72 50 Q65 55, 58 50 Q52 45, 52 55"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              className="neural-path path-6"
              d="M68 62 Q62 58, 58 62 Q54 66, 56 70"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
              fill="none"
            />

            {/* Central connection */}
            <line
              className="neural-path center-line"
              x1="50" y1="28"
              x2="50" y2="72"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />

            {/* Neural nodes */}
            <circle className="neural-node node-1" cx="35" cy="38" r="2" fill="white" />
            <circle className="neural-node node-2" cx="42" cy="52" r="2" fill="white" />
            <circle className="neural-node node-3" cx="38" cy="65" r="2" fill="white" />
            <circle className="neural-node node-4" cx="65" cy="38" r="2" fill="white" />
            <circle className="neural-node node-5" cx="58" cy="52" r="2" fill="white" />
            <circle className="neural-node node-6" cx="62" cy="65" r="2" fill="white" />
            <circle className="neural-node node-center" cx="50" cy="50" r="3" fill="white" />
          </g>
        </svg>

        {/* Particle effects */}
        <div className="brain-particles">
          <span className="particle p1" />
          <span className="particle p2" />
          <span className="particle p3" />
          <span className="particle p4" />
          <span className="particle p5" />
          <span className="particle p6" />
        </div>
      </div>

      {/* Activity label - human, conversational */}
      {isActive && (
        <span className="ai-brain-label">
          {activityType === 'transcribing' ? '🎧 Ich höre...' :
           activityType === 'searching' ? '🔍 Schaue nach...' :
           activityType === 'processing' ? '💭 Denke nach...' : '⚡ Arbeite...'}
        </span>
      )}
    </div>
  );
}
