import React, { memo } from 'react';
import { getStepsForType, getStepProgress } from '../utils/aiSteps';
import { AI_PERSONALITY, AI_AVATAR } from '../utils/aiPersonality';
import '../neurodesign.css';
import './AIProcessingOverlay.css';

export type ProcessType = 'voice' | 'text' | 'search';

interface AIProcessingOverlayProps {
  isVisible: boolean;
  processType: ProcessType;
  currentStepIndex: number;
  customMessage?: string;
}

/**
 * AIProcessingOverlay - Shows transparent AI processing status
 *
 * Displays what the AI is currently doing with step-by-step progress
 * to make the AI feel more "human" and trustworthy.
 */
const AIProcessingOverlayComponent: React.FC<AIProcessingOverlayProps> = ({
  isVisible,
  processType,
  currentStepIndex,
  customMessage,
}) => {
  const steps = getStepsForType(processType);
  const currentStep = steps[currentStepIndex];
  const progress = getStepProgress(steps, currentStepIndex);

  if (!isVisible || !currentStep) return null;

  // Calculate stroke dasharray for progress ring (circumference = 2 * PI * r = 2 * 3.14159 * 16 ≈ 100)
  const circumference = 100;
  const strokeDasharray = `${progress} ${circumference}`;

  return (
    <div className="ai-overlay liquid-glass-nav" role="status" aria-live="polite">
      <div className="ai-overlay-content">
        <div className="ai-overlay-header">
          <div className="ai-overlay-avatar neuro-breathing" aria-hidden="true">
            {AI_AVATAR.emoji}
          </div>
          <div className="ai-overlay-progress-ring" aria-hidden="true">
            <svg viewBox="0 0 36 36">
              <circle
                className="progress-bg"
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="var(--border)"
                strokeWidth="2"
              />
              <circle
                className="progress-bar"
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="ai-overlay-progress-text">{progress}%</span>
        </div>

        <div className="ai-overlay-message">
          <span className="ai-overlay-emoji" aria-hidden="true">
            {currentStep.emoji}
          </span>
          <span>{customMessage || currentStep.description}</span>
        </div>

        <div className="ai-overlay-steps" aria-label="Verarbeitungsschritte">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`ai-overlay-step ${
                index < currentStepIndex
                  ? 'completed'
                  : index === currentStepIndex
                  ? 'active'
                  : ''
              }`}
            >
              <span className="step-dot neuro-status-dot" aria-hidden="true" />
              <span className="step-label">{step.label}</span>
            </div>
          ))}
        </div>

        <div className="ai-overlay-name">
          {AI_PERSONALITY.name} arbeitet...
        </div>
      </div>
    </div>
  );
};

export const AIProcessingOverlay = memo(AIProcessingOverlayComponent);
