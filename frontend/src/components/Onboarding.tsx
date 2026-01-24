import { useState, useEffect } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { AI_PERSONALITY, AI_AVATAR, getTimeBasedGreeting, getRandomReward } from '../utils/aiPersonality';
import './Onboarding.css';
import '../neurodesign.css';

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
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const timeGreeting = getTimeBasedGreeting();

  // Typing animation for AI introduction
  const introText = `${timeGreeting.greeting} Ich bin ${AI_PERSONALITY.name}, dein persönlicher KI-Begleiter. Ich bin hier, um dir zu helfen, deine Gedanken zu ordnen und aus deinen Ideen zu lernen.`;

  useEffect(() => {
    if (currentStep === 0 && isTyping) {
      let index = 0;
      const timer = setInterval(() => {
        if (index < introText.length) {
          setTypingText(introText.slice(0, index + 1));
          index++;
        } else {
          setIsTyping(false);
          clearInterval(timer);
        }
      }, 30);
      return () => clearInterval(timer);
    }
  }, [currentStep, isTyping, introText]);

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
              <div className="ai-introduction">
                <div className="ai-avatar-large">
                  {AI_AVATAR.emoji}
                  <div className="ai-avatar-glow" />
                </div>
                <div className="ai-name-badge">{AI_PERSONALITY.name}</div>
              </div>
              <h1>Willkommen!</h1>
              <div className="typing-container">
                <p className={`typing-text ${!isTyping ? 'complete' : ''}`}>
                  {typingText}
                  {isTyping && <span className="cursor">|</span>}
                </p>
              </div>
              <div className="ai-traits">
                {AI_PERSONALITY.traits.slice(0, 4).map((trait, i) => (
                  <span key={i} className="trait-badge">{trait}</span>
                ))}
              </div>
              <p className="subtle">
                Lass uns kurz kennenlernen – dann kann ich dir noch besser helfen!
              </p>
            </div>
          )}

          {currentStep === 1 && (
            <div className="step-content context-step">
              <div className="step-ai-hint">
                <span className="hint-avatar">{AI_AVATAR.curiousEmoji}</span>
                <span>{AI_PERSONALITY.name} fragt:</span>
              </div>
              <h2>Erzähl mir von dir!</h2>
              <p>Diese Infos helfen mir, dich besser zu verstehen und relevantere Vorschläge zu machen.</p>

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
              <div className="step-ai-hint">
                <span className="hint-avatar">{AI_AVATAR.happyEmoji}</span>
                <span>Super! Noch eine Frage:</span>
              </div>
              <h2>Was möchtest du erreichen?</h2>
              <p>Das hilft {AI_PERSONALITY.name}, dich besser zu unterstützen. Wähle eins oder mehrere.</p>

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
              <div className="ai-celebration">
                <div className="celebration-avatar">{AI_AVATAR.celebratingEmoji}</div>
                <div className="celebration-sparkles">
                  <span className="sparkle">✨</span>
                  <span className="sparkle">✨</span>
                  <span className="sparkle">✨</span>
                </div>
              </div>
              <h2>Wir sind startklar!</h2>
              <p>
                Freut mich, dich kennenzulernen! Ich bin bereit, dir zu helfen.
                Je mehr wir zusammenarbeiten, desto besser verstehe ich dich.
              </p>
              <div className="tips">
                <h3>{AI_PERSONALITY.name}s Tipps zum Start:</h3>
                <ul>
                  <li><strong>Sprich frei</strong> – ich strukturiere deine Gedanken automatisch</li>
                  <li><strong>Gib Feedback</strong> – mit 👍/👎 lerne ich dazu</li>
                  <li><strong>Erkunde</strong> – im Lernzentrum siehst du, was ich über dich gelernt habe</li>
                </ul>
              </div>
              <div className="ai-promise">
                <span className="promise-icon">{AI_AVATAR.emoji}</span>
                <span className="promise-text">
                  "Ich freue mich auf unsere Zusammenarbeit!" – {AI_PERSONALITY.name}
                </span>
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
