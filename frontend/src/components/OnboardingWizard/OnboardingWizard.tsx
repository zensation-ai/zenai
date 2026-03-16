/**
 * OnboardingWizard - 4-Step First-Run Experience
 *
 * Fullscreen wizard shown on first visit:
 * 1. Welcome - App name, tagline, animated brain icon
 * 2. Context Selection - Choose primary context (personal/work/learning/creative)
 * 3. First Idea - Create first idea with skip option
 * 4. Discovery - Show 4 key features
 */

import { useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import { logError } from '../../utils/errors';
import './OnboardingWizard.css';

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

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

const CONTEXT_OPTIONS: ContextOption[] = [
  { id: 'personal', icon: '🏠', label: 'Privat', description: 'Persoenliche Gedanken, Ideen und Notizen' },
  { id: 'work', icon: '💼', label: 'Arbeit', description: 'Projekte, Aufgaben und berufliche Ideen' },
  { id: 'learning', icon: '📚', label: 'Lernen', description: 'Lernziele, Kurse und Wissensmanagement' },
  { id: 'creative', icon: '🎨', label: 'Kreativ', description: 'Kreative Projekte, Designs und Inspiration' },
];

const FEATURES: FeatureItem[] = [
  { icon: '💬', title: 'Chat', description: 'Sprich mit deiner KI - sie merkt sich alles' },
  { icon: '💡', title: 'Gedanken', description: 'Sammle und organisiere deine Ideen' },
  { icon: '🔧', title: 'Werkstatt', description: 'KI-Agenten arbeiten fuer dich' },
  { icon: '📊', title: 'Insights', description: 'Entdecke Muster in deinem Denken' },
];

const TOTAL_STEPS = 4;

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
      setStep(TOTAL_STEPS - 1);
    }
  }, [ideaText, selectedContext]);

  const handleSkipIdea = useCallback(() => {
    setStep(TOTAL_STEPS - 1);
  }, []);

  const handleFinish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (step === 0 || step === 1) {
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
              <p className="onboarding-wizard-tagline">Dein persoenlicher KI-Assistent</p>
              <p className="onboarding-wizard-subtitle">
                Organisiere deine Gedanken, lerne dazu und lass die KI fuer dich arbeiten.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-wizard-step onboarding-wizard-step-context">
              <h2 className="onboarding-wizard-heading">Waehle deinen Hauptkontext</h2>
              <p className="onboarding-wizard-description">Du kannst den Kontext spaeter jederzeit wechseln.</p>
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
                placeholder="z.B. Ich moechte eine App bauen, die..."
                rows={4}
                autoFocus
              />
              <div className="onboarding-wizard-idea-actions">
                <button
                  type="button"
                  className="onboarding-wizard-btn-secondary"
                  onClick={handleSkipIdea}
                >
                  Ueberspringen
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
            <div className="onboarding-wizard-step onboarding-wizard-step-discovery">
              <h2 className="onboarding-wizard-heading">Entdecke ZenAI</h2>
              <p className="onboarding-wizard-description">Hier sind die wichtigsten Bereiche:</p>
              <div className="onboarding-wizard-features">
                {FEATURES.map((feature) => (
                  <div key={feature.title} className="onboarding-wizard-feature-card">
                    <span className="onboarding-wizard-feature-icon" aria-hidden="true">{feature.icon}</span>
                    <div className="onboarding-wizard-feature-text">
                      <strong>{feature.title}</strong>
                      <span>{feature.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="onboarding-wizard-nav">
          {step > 0 && step < 3 && (
            <button type="button" className="onboarding-wizard-btn-back" onClick={handleBack}>
              Zurueck
            </button>
          )}
          {step === 0 && (
            <div /> /* spacer */
          )}
          {step < 2 && (
            <button
              type="button"
              className="onboarding-wizard-btn-primary"
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              {step === 0 ? "Los geht's" : 'Weiter'}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className="onboarding-wizard-btn-primary onboarding-wizard-btn-finish"
              onClick={handleFinish}
            >
              Fertig
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;
