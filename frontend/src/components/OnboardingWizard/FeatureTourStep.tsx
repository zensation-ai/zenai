/**
 * FeatureTourStep - Onboarding Step 5
 *
 * 5 feature cards highlighting the core areas of ZenAI.
 * Duration: ~90s
 */

import { MessageSquare, Lightbulb, CalendarCheck, FileText, BrainCircuit } from 'lucide-react';

interface FeatureTourStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: <MessageSquare size={20} />,
    title: 'Chat',
    description: 'Stelle Fragen, denk laut nach – die KI erinnert sich an alles und wird mit der Zeit klüger.',
    color: 'rgba(20, 74, 86, 0.7)',
  },
  {
    icon: <Lightbulb size={20} />,
    title: 'Ideen',
    description: 'Wirf rohe Gedanken hinein, die KI strukturiert, verknüpft und entwickelt sie weiter.',
    color: 'rgba(30, 58, 100, 0.7)',
  },
  {
    icon: <CalendarCheck size={20} />,
    title: 'Planer',
    description: 'Aufgaben, Projekte und Kalender in einer Ansicht – intelligent priorisiert.',
    color: 'rgba(55, 35, 90, 0.7)',
  },
  {
    icon: <FileText size={20} />,
    title: 'Dokumente',
    description: 'Speichere PDFs, Notizen und Wissen – durchsuchbar mit semantischer KI-Suche.',
    color: 'rgba(70, 40, 40, 0.7)',
  },
  {
    icon: <BrainCircuit size={20} />,
    title: 'My AI',
    description: 'Dein persönliches KI-Profil: Lernfortschritt, Gedächtnisebenen und kognitive Einblicke.',
    color: 'rgba(20, 60, 50, 0.7)',
  },
];

export function FeatureTourStep({ onNext: _onNext, onBack: _onBack }: FeatureTourStepProps) {
  return (
    <div className="onboarding-wizard-step onboarding-wizard-step-feature-tour">
      <h2 className="onboarding-wizard-heading">Was ZenAI für dich bereithält</h2>
      <p className="onboarding-wizard-description">5 Bereiche – ein nahtloses KI-Betriebssystem.</p>

      <div className="flex flex-col gap-2 mt-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="flex items-center gap-4 rounded-xl px-4 py-3"
            style={{
              background: feature.color,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 text-teal-200"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              {feature.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{feature.title}</p>
              <p className="text-xs text-white/60 leading-snug mt-0.5">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FeatureTourStep;
