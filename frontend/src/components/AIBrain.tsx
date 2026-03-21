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
    // Intentionally include isActive to pick a new random message on activity toggle
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
      {/* Tooltip - Komplett ausblenden im large-mode, da Hero-Section bereits Greeting zeigt */}
      {/* Dies verhindert doppelte Begrüßung und Layout-Shift durch Hover-Tooltips */}
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

        {/* Brain SVG - Sunset Orange Theme (Erkennungsmerkmal) - High Quality */}
        <svg
          className="ai-brain-svg"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="AI Brain Animation"
          style={{ background: 'transparent' }}
        >
          <defs>
            {/* Premium Sunset Orange Gradient - My Brain Signature */}
            <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffb347" />
              <stop offset="35%" stopColor="#ff9f33" />
              <stop offset="50%" stopColor="#ff8c00" />
              <stop offset="65%" stopColor="#ff7a1a" />
              <stop offset="100%" stopColor="#ff6347" />
            </linearGradient>
            {/* Inner highlight gradient for depth */}
            <linearGradient id="brainHighlight" x1="0%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            {/* Soft glow filter - extended region */}
            <filter id="brainGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Subtle inner shadow for depth */}
            <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Brain shape - organic, detailed */}
          <g className="brain-group" filter="url(#brainGlow)">
            {/* Left hemisphere - organic curves */}
            <path
              className="brain-hemisphere left"
              d="M24 50
                 C24 38, 27 28, 35 23
                 C40 20, 44 20, 47 22
                 C49 24, 50 26, 50 28
                 C50 32, 48 36, 47 40
                 C46 44, 48 47, 49 50
                 C50 53, 48 57, 46 62
                 C44 67, 41 72, 37 74
                 C32 76, 28 74, 26 70
                 C24 65, 24 58, 24 50Z"
              fill="url(#brainGradient)"
            />
            {/* Left hemisphere highlight */}
            <path
              className="brain-hemisphere-highlight"
              d="M28 45
                 C28 38, 30 32, 36 28
                 C40 25, 44 26, 46 30
                 C45 34, 43 38, 42 42
                 C40 38, 35 36, 32 40
                 C29 44, 28 48, 28 45Z"
              fill="url(#brainHighlight)"
            />

            {/* Right hemisphere - organic curves */}
            <path
              className="brain-hemisphere right"
              d="M76 50
                 C76 38, 73 28, 65 23
                 C60 20, 56 20, 53 22
                 C51 24, 50 26, 50 28
                 C50 32, 52 36, 53 40
                 C54 44, 52 47, 51 50
                 C50 53, 52 57, 54 62
                 C56 67, 59 72, 63 74
                 C68 76, 72 74, 74 70
                 C76 65, 76 58, 76 50Z"
              fill="url(#brainGradient)"
            />
            {/* Right hemisphere highlight */}
            <path
              className="brain-hemisphere-highlight"
              d="M72 45
                 C72 38, 70 32, 64 28
                 C60 25, 56 26, 54 30
                 C55 34, 57 38, 58 42
                 C60 38, 65 36, 68 40
                 C71 44, 72 48, 72 45Z"
              fill="url(#brainHighlight)"
            />

            {/* Brain folds - left (gyri/sulci) */}
            <path
              className="neural-path path-1"
              d="M28 36 Q33 32, 38 36 Q43 40, 44 45"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
            <path
              className="neural-path path-2"
              d="M27 50 Q34 46, 40 50 Q46 54, 45 60"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              className="neural-path path-3"
              d="M30 64 Q36 60, 40 64 Q44 68, 42 72"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />

            {/* Brain folds - right (gyri/sulci) */}
            <path
              className="neural-path path-4"
              d="M72 36 Q67 32, 62 36 Q57 40, 56 45"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
            <path
              className="neural-path path-5"
              d="M73 50 Q66 46, 60 50 Q54 54, 55 60"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              className="neural-path path-6"
              d="M70 64 Q64 60, 60 64 Q56 68, 58 72"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />

            {/* Corpus callosum - central connection */}
            <path
              className="neural-path center-line"
              d="M50 30 C50 35, 50 40, 50 50 C50 60, 50 65, 50 70"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1.2"
              strokeDasharray="4,3"
              strokeLinecap="round"
              fill="none"
            />

            {/* Neural nodes - synaptic points */}
            <circle className="neural-node node-1" cx="34" cy="38" r="2.2" fill="white" opacity="0.9" />
            <circle className="neural-node node-2" cx="40" cy="52" r="2" fill="white" opacity="0.85" />
            <circle className="neural-node node-3" cx="36" cy="66" r="1.8" fill="white" opacity="0.8" />
            <circle className="neural-node node-4" cx="66" cy="38" r="2.2" fill="white" opacity="0.9" />
            <circle className="neural-node node-5" cx="60" cy="52" r="2" fill="white" opacity="0.85" />
            <circle className="neural-node node-6" cx="64" cy="66" r="1.8" fill="white" opacity="0.8" />
            {/* Central node - larger, brighter */}
            <circle className="neural-node node-center" cx="50" cy="50" r="3.5" fill="white" opacity="1" />
            {/* Additional synaptic detail */}
            <circle className="neural-node node-7" cx="44" cy="42" r="1.5" fill="white" opacity="0.6" />
            <circle className="neural-node node-8" cx="56" cy="42" r="1.5" fill="white" opacity="0.6" />
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
