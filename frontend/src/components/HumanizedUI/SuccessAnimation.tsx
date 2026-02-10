import { useState, useEffect } from 'react';
import {
  type ActionFeedback,
  getActionFeedback,
} from '../../utils/humanizedMessages';

export interface SuccessAnimationProps {
  /** Is active */
  show: boolean;
  /** Action type */
  action?: 'archive' | 'save' | 'delete' | 'publish' | 'connect' | 'share' | 'learn' | 'voice' | 'search';
  /** Custom feedback */
  feedback?: ActionFeedback;
  /** Callback after animation */
  onComplete?: () => void;
  /** Position */
  position?: 'center' | 'inline' | 'toast';
  /** Context for feedback */
  context?: { count?: number; name?: string };
}

export const SuccessAnimation = ({
  show,
  action = 'save',
  feedback: customFeedback,
  onComplete,
  position = 'toast',
  context,
}: SuccessAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  useEffect(() => {
    if (show) {
      const newFeedback = customFeedback || getActionFeedback(action, context);
      setFeedback(newFeedback);
      setVisible(true);

      const duration = newFeedback.duration || 2500;
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, action, customFeedback, context, onComplete]);

  if (!visible || !feedback) return null;

  return (
    <div className={`success-animation ${position} ${visible ? 'visible' : ''}`}>
      {/* Burst-Effekt */}
      <div className="success-burst" />

      {/* Icon */}
      <div className="success-icon">
        <span className="icon-emoji">{feedback.icon || '\u2713'}</span>
        <div className="icon-ring" />
      </div>

      {/* Nachricht */}
      <div className="success-content">
        <span className="success-message">{feedback.message}</span>
        {feedback.subMessage && (
          <span className="success-submessage">{feedback.subMessage}</span>
        )}
      </div>

      {/* Confetti for special actions */}
      {(action === 'publish' || action === 'connect') && (
        <div className="success-confetti">
          {[...Array(6)].map((_, i) => (
            <span key={i} className="confetti-piece" />
          ))}
        </div>
      )}
    </div>
  );
};
