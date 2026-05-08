/**
 * OnboardingWizard - 6-Step First-Run Experience
 *
 * Fullscreen wizard shown on first visit:
 * 1. Welcome - App name, tagline, animated brain icon
 * 2. Context Selection - Choose primary context (operations/finance/people/strategy)
 * 3. First Idea - Create first idea with skip option
 * 4. AI Discovery - AI follow-up questions + memory demo
 * 5. Feature Tour - 5 core feature cards
 * 6. Shortcut Training - 5 interactive keyboard shortcuts
 */

import { useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import { logError } from '../../utils/errors';
import { AIDiscoveryStep } from './AIDiscoveryStep';
import { FeatureTourStep } from './FeatureTourStep';
import { ShortcutTrainingStep } from './ShortcutTrainingStep';
interface OnboardingWizardProps {
  context: AIContext;
  onContextChange: (context: AIContext) => void;
  onComplete: () => void;
}

interface ContextOption {
  id: AIContext;
  icon: string;
  label: string;
  description: string;
}

const CONTEXT_OPTIONS: ContextOption[] = [
  { id: 'operations', icon: '⚙️', label: 'Operativ', description: 'Operative Aufgaben, Prozesse und Tagesgeschäft' },
  { id: 'finance', icon: '💰', label: 'Finanzen', description: 'Projekte, Budgets und finanzielle Planung' },
  { id: 'people', icon: '👥', label: 'Team', description: 'Teamführung, HR und Personalentwicklung' },
  { id: 'strategy', icon: '🎯', label: 'Strategie', description: 'Strategische Planung, Visionen und Innovation' },
];


const TOTAL_STEPS = 6;

export function OnboardingWizard({ context, onContextChange, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedContext, setSelectedContext] = useState<AIContext>(context);
  const [ideaText, setIdeaText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canAdvance = useCallback(() => {
    if (step === 1) return true; // Context always has a default selection
    return true;
  }, [step]);

  const handleNext = useCallback(() => {
    if (step === 1) {
      onContextChange(selectedContext);
    }
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    }
  }, [step, selectedContext, onContextChange]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleContextSelect = useCallback((ctx: AIContext) => {
    setSelectedContext(ctx);
  }, []);

  const handleCreateIdea = useCallback(async () => {
    if (!ideaText.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`/api/${selectedContext}/ideas`, {
        raw_transcript: ideaText.trim(),
      });
    } catch (error) {
      logError('OnboardingWizard:createIdea', error);
    } finally {
      setSubmitting(false);
      setStep(3); // Advance to AI Discovery step
    }
  }, [ideaText, selectedContext]);

  const handleSkipIdea = useCallback(() => {
    setStep(3); // Advance to AI Discovery step
  }, []);

  const handleFinish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (step === 0 || step === 1 || step === 3 || step === 4) {
        e.preventDefault();
        handleNext();
      } else if (step === 2 && ideaText.trim()) {
        e.preventDefault();
        handleCreateIdea();
      } else if (step === TOTAL_STEPS - 1) {
        e.preventDefault();
        handleFinish();
      }
    }
  }, [step, ideaText, handleNext, handleCreateIdea, handleFinish]);

  return (
    <div className="onboarding-wizard-overlay" onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label="Onboarding">
      <div className="onboarding-wizard-card">
        {/* Progress dots */}
        <div className="onboarding-wizard-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`onboarding-wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="onboarding-wizard-content">
          {step === 0 && (
            <div className="onboarding-wizard-step onboarding-wizard-step-welcome">
              <div className="onboarding-wizard-brain" aria-hidden="true">🧠</div>
              <h1 className="onboarding-wizard-title">ZenAI</h1>
              <p className="onboarding-wizard-tagline">Dein persönlicher KI-Assistent</p>
              <p className="onboarding-wizard-subtitle">
                Organisiere deine Gedanken, lerne dazu und lass die KI für dich arbeiten.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-wizard-step onboarding-wizard-step-context">
              <h2 className="onboarding-wizard-heading">Wähle deinen Hauptkontext</h2>
              <p className="onboarding-wizard-description">Du kannst den Kontext später jederzeit wechseln.</p>
              <div className="onboarding-wizard-context-grid">
                {CONTEXT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`onboarding-wizard-context-card ${selectedContext === opt.id ? 'selected' : ''}`}
                    onClick={() => handleContextSelect(opt.id)}
                    aria-pressed={selectedContext === opt.id}
                  >
                    <span className="onboarding-wizard-context-icon" aria-hidden="true">{opt.icon}</span>
                    <span className="onboarding-wizard-context-label">{opt.label}</span>
                    <span className="onboarding-wizard-context-desc">{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-wizard-step onboarding-wizard-step-idea">
              <h2 className="onboarding-wizard-heading">Deine erste Idee</h2>
              <p className="onboarding-wizard-description">
                Schreib einfach drauf los - die KI strukturiert es automatisch.
              </p>
              <textarea
                className="onboarding-wizard-textarea"
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder="z.B. Ich möchte eine App bauen, die..."
                rows={4}
                autoFocus
              />
              <div className="onboarding-wizard-idea-actions">
                <button
                  type="button"
                  className="onboarding-wizard-btn-secondary"
                  onClick={handleSkipIdea}
                >
                  Überspringen
                </button>
                <button
                  type="button"
                  className="onboarding-wizard-btn-primary"
                  onClick={handleCreateIdea}
                  disabled={!ideaText.trim() || submitting}
                >
                  {submitting ? 'Wird erstellt...' : 'Idee erstellen'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <AIDiscoveryStep
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {step === 4 && (
            <FeatureTourStep
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {step === 5 && (
            <ShortcutTrainingStep
              onNext={handleFinish}
              onBack={handleBack}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="onboarding-wizard-nav">
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <button type="button" className="onboarding-wizard-btn-back" onClick={handleBack}>
              Zurück
            </button>
          )}
          {step === 0 && (
            <div /> /* spacer */
          )}
          {step === 0 && (
            <button
              type="button"
              className="onboarding-wizard-btn-primary"
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              Los geht&apos;s
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              className="onboarding-wizard-btn-primary"
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              Weiter
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className="onboarding-wizard-btn-primary"
              onClick={handleNext}
            >
              Beeindruckend! Weiter →
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              className="onboarding-wizard-btn-primary"
              onClick={handleNext}
            >
              Tour abschließen →
            </button>
          )}
          {step === TOTAL_STEPS - 1 && (
            <button
              type="button"
              className="onboarding-wizard-btn-primary onboarding-wizard-btn-finish"
              onClick={handleFinish}
            >
              Loslegen 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;
