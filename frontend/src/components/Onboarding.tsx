import { useState } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './Onboarding.css';

interface OnboardingProps {
  context: string;
  onComplete: () => void;
}

interface OnboardingData {
  company_name: string;
  industry: string;
  role: string;
  goals: string[];
}

const STEPS = [
  { id: 'welcome', title: 'Willkommen' },
  { id: 'context', title: 'Dein Kontext' },
  { id: 'goals', title: 'Deine Ziele' },
  { id: 'complete', title: 'Fertig' },
];

const GOAL_OPTIONS = [
  { id: 'productivity', label: 'Produktivität steigern', icon: '🚀' },
  { id: 'learning', label: 'Neues lernen', icon: '📚' },
  { id: 'organization', label: 'Gedanken organisieren', icon: '🗂️' },
  { id: 'creativity', label: 'Kreativität fördern', icon: '💡' },
  { id: 'focus', label: 'Fokus verbessern', icon: '🎯' },
  { id: 'tracking', label: 'Ideen festhalten', icon: '📝' },
];

export function Onboarding({ context, onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    company_name: '',
    industry: '',
    role: '',
    goals: [],
  });
  const [saving, setSaving] = useState(false);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleToggleGoal = (goalId: string) => {
    setData((prev) => ({
      ...prev,
      goals: prev.goals.includes(goalId)
        ? prev.goals.filter((g) => g !== goalId)
        : [...prev.goals, goalId],
    }));
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      // Try to save profile data (may fail if table doesn't exist yet)
      try {
        await axios.put(`/api/${context}/profile`, {
          company_name: data.company_name || undefined,
          industry: data.industry || undefined,
          role: data.role || undefined,
          goals: data.goals.map((g) => GOAL_OPTIONS.find((o) => o.id === g)?.label || g),
        });
      } catch {
        // Profile save failed - continue anyway (table may not exist)
        console.warn('Profile save failed - continuing with onboarding');
      }

      // Create default focus areas if goals selected
      if (data.goals.length > 0) {
        try {
          await axios.post(`/api/${context}/focus/presets`);
        } catch {
          // Presets might already exist or table missing
        }
      }

      showToast('Willkommen!', 'success');
      onComplete();
    } catch (error) {
      // Even if everything fails, complete onboarding
      console.error('Onboarding error:', error);
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        <div className="onboarding-progress">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={`progress-step ${i <= currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-content">
          {currentStep === 0 && (
            <div className="step-content welcome-step">
              <div className="welcome-icon">🧠</div>
              <h1>Willkommen bei deinem KI-Gehirn</h1>
              <p>
                Diese App hilft dir, deine Gedanken zu strukturieren und aus deinen Ideen zu lernen.
                Die KI passt sich deinem Kontext an und wird mit der Zeit immer besser.
              </p>
              <p className="subtle">
                Lass uns kurz einrichten, wie du die App nutzen möchtest.
              </p>
            </div>
          )}

          {currentStep === 1 && (
            <div className="step-content context-step">
              <h2>Erzähl mir von dir</h2>
              <p>Diese Infos helfen der KI, dich besser zu verstehen.</p>

              <div className="form-group">
                <label htmlFor="onboarding-context">Kontext / Unternehmen</label>
                <input
                  id="onboarding-context"
                  type="text"
                  value={data.company_name}
                  onChange={(e) => setData({ ...data, company_name: e.target.value })}
                  placeholder="z.B. Mein Startup, Freiberuflich, Privat"
                />
              </div>

              <div className="form-group">
                <label htmlFor="onboarding-industry">Branche / Bereich</label>
                <input
                  id="onboarding-industry"
                  type="text"
                  value={data.industry}
                  onChange={(e) => setData({ ...data, industry: e.target.value })}
                  placeholder="z.B. Software, Marketing, Design"
                />
              </div>

              <div className="form-group">
                <label htmlFor="onboarding-role">Deine Rolle</label>
                <input
                  id="onboarding-role"
                  type="text"
                  value={data.role}
                  onChange={(e) => setData({ ...data, role: e.target.value })}
                  placeholder="z.B. Entwickler, Gründer, Student"
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="step-content goals-step">
              <h2>Was möchtest du erreichen?</h2>
              <p>Wähle aus, was dir wichtig ist (mehrere möglich).</p>

              <div className="goals-grid">
                {GOAL_OPTIONS.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    className={`goal-option ${data.goals.includes(goal.id) ? 'selected' : ''}`}
                    onClick={() => handleToggleGoal(goal.id)}
                  >
                    <span className="goal-icon">{goal.icon}</span>
                    <span className="goal-label">{goal.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="step-content complete-step">
              <div className="complete-icon">✨</div>
              <h2>Alles bereit!</h2>
              <p>
                Du kannst jetzt loslegen. Sprich oder tippe deine Gedanken ein,
                und die KI hilft dir, sie zu strukturieren.
              </p>
              <div className="tips">
                <h3>Schnellstart-Tipps:</h3>
                <ul>
                  <li>Nutze das Mikrofon für schnelle Sprachnotizen</li>
                  <li>Im Lernzentrum siehst du, was die KI gelernt hat</li>
                  <li>Gib Feedback mit 👍/👎 um die KI zu verbessern</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="onboarding-actions">
          {currentStep > 0 && currentStep < 3 && (
            <button type="button" className="back-btn" onClick={handleBack}>
              Zurück
            </button>
          )}

          {currentStep === 0 && (
            <button type="button" className="skip-btn" onClick={handleSkip}>
              Überspringen
            </button>
          )}

          {currentStep < 3 && (
            <button type="button" className="next-btn" onClick={handleNext}>
              {currentStep === 0 ? 'Los geht\'s' : 'Weiter'}
            </button>
          )}

          {currentStep === 3 && (
            <button
              type="button"
              className="complete-btn"
              onClick={handleComplete}
              disabled={saving}
            >
              {saving ? 'Speichere...' : 'Fertig'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
