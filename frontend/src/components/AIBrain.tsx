import { useState, useEffect, useMemo, useRef } from 'react';
import {
  AI_PERSONALITY,
  AI_ACTIVITY_MESSAGES,
  getTimeBasedGreeting,
  getIdleMessage,
  getRandomTip,
  FEEDBACK_REACTIONS,
} from '../utils/aiPersonality';
import '../neurodesign.css';
import './AIBrain.css';

interface AIBrainProps {
  isActive: boolean;
  activityType?: 'thinking' | 'transcribing' | 'searching' | 'processing' | 'learning' | 'success';
  ideasCount?: number;
  size?: 'small' | 'large';
  showTip?: boolean;
  onInteraction?: () => void;
}

export function AIBrain({
  isActive,
  activityType = 'thinking',
  ideasCount = 0,
  size = 'small',
  showTip = false,
  onInteraction,
}: AIBrainProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [clickFeedback, setClickFeedback] = useState(false);
  const [currentTip, setCurrentTip] = useState<string | null>(null);
  const [interactionCount, setInteractionCount] = useState(0);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get time-based greeting
  const timeGreeting = useMemo(() => getTimeBasedGreeting(), []);

  // Show random tip periodically
  useEffect(() => {
    if (showTip && !isActive && size === 'large') {
      tipTimeoutRef.current = setTimeout(() => {
        setCurrentTip(getRandomTip('general'));
      }, 10000);

      return () => {
        if (tipTimeoutRef.current) {
          clearTimeout(tipTimeoutRef.current);
        }
      };
    }
  }, [showTip, isActive, size]);

  // Cleanup click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Get random message for variety - now using centralized system
  const currentMessage = useMemo(() => {
    const messages = AI_ACTIVITY_MESSAGES[activityType] || AI_ACTIVITY_MESSAGES.thinking;
    return messages[Math.floor(Math.random() * messages.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityType, isActive]);

  // Idle tooltip with personality and context - now using centralized function
  const idleMessage = useMemo(() => {
    return getIdleMessage(ideasCount, timeGreeting.greeting);
  }, [timeGreeting.greeting, ideasCount]);

  const handleClick = () => {
    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    setClickFeedback(true);
    setInteractionCount((prev) => prev + 1);
    clickTimeoutRef.current = setTimeout(() => setClickFeedback(false), 300);

    // Callback for parent component
    onInteraction?.();
  };

  // Get activity label with more personality
  const getActivityLabel = () => {
    switch (activityType) {
      case 'transcribing':
        return `${AI_PERSONALITY.name} hört zu...`;
      case 'searching':
        return `${AI_PERSONALITY.name} sucht...`;
      case 'processing':
        return `${AI_PERSONALITY.name} denkt nach...`;
      case 'learning':
        return `${AI_PERSONALITY.name} lernt...`;
      case 'success':
        return `${AI_PERSONALITY.name} ist fertig!`;
      default:
        return `${AI_PERSONALITY.name} arbeitet...`;
    }
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
      {/* Tooltip - Im Large-Mode komplett ausgeblendet, da Hero-Section bereits alles anzeigt */}
      {showTooltip && size !== 'large' && (
        <div className="ai-brain-tooltip neuro-tooltip-enhanced">
          {!isActive && (
            <span className="ai-brain-tooltip-greeting">{timeGreeting.greeting}</span>
          )}
          <span className="ai-brain-tooltip-message">
            {isActive ? currentMessage : idleMessage}
          </span>
        </div>
      )}
      <div className="ai-brain-wrapper neuro-breathing">
        {/* Outer glow rings */}
        <div className="brain-glow-ring ring-1" />
        <div className="brain-glow-ring ring-2" />
        <div className="brain-glow-ring ring-3" />

        {/* Brain SVG - ZenAI Green Theme */}
        <svg
          className="ai-brain-svg"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="AI Brain Animation"
        >
          <defs>
            {/* Dark green background circle */}
            <radialGradient id="bgGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#234a3c" />
              <stop offset="100%" stopColor="#1a3a2f" />
            </radialGradient>
            {/* ZenAI Green brain gradient */}
            <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a8e6cf" />
              <stop offset="50%" stopColor="#88d8b0" />
              <stop offset="100%" stopColor="#6bcf9f" />
            </linearGradient>
            {/* Fix: Extended filter region to prevent clipping of glow effect */}
            <filter id="brainGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Dark green background */}
          <circle cx="50" cy="50" r="48" fill="url(#bgGradient)" />

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
          {activityType === 'transcribing' && '🎧 '}
          {activityType === 'searching' && '🔍 '}
          {activityType === 'processing' && '💭 '}
          {activityType === 'learning' && '📚 '}
          {activityType === 'success' && '✨ '}
          {activityType === 'thinking' && '⚡ '}
          {getActivityLabel()}
        </span>
      )}

      {/* Random tip display for large size */}
      {currentTip && size === 'large' && !isActive && (
        <div className="ai-brain-tip">
          <span className="tip-icon">💡</span>
          <span className="tip-text">{currentTip}</span>
        </div>
      )}

      {/* Interaction easter egg - shows after multiple clicks */}
      {interactionCount > 5 && interactionCount % 5 === 0 && (
        <div className="ai-brain-easter-egg" role="status" aria-live="polite">
          {FEEDBACK_REACTIONS.positive[interactionCount % FEEDBACK_REACTIONS.positive.length]}
        </div>
      )}
    </div>
  );
}
