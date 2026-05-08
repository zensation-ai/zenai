/**
 * AIDiscoveryStep - Onboarding Step 4
 *
 * Shows 3 AI follow-up questions about the user's first idea
 * and demonstrates the memory-save notification.
 * Duration: ~60s
 */

import { useState, useEffect } from 'react';
import { Brain, MessageCircle, Sparkles, CheckCircle2 } from 'lucide-react';

interface AIDiscoveryStepProps {
  onNext: () => void;
  onBack: () => void;
}

const FOLLOW_UP_QUESTIONS = [
  {
    id: 1,
    question: 'Was ist das wichtigste Problem, das du damit lösen möchtest?',
    delay: 400,
  },
  {
    id: 2,
    question: 'Für wen ist diese Idee – dich selbst oder andere?',
    delay: 900,
  },
  {
    id: 3,
    question: 'Welchen ersten Schritt könntest du heute noch umsetzen?',
    delay: 1400,
  },
];

export function AIDiscoveryStep({ onNext: _onNext, onBack: _onBack }: AIDiscoveryStepProps) {
  const [visibleQuestions, setVisibleQuestions] = useState<number[]>([]);
  const [memorySaved, setMemorySaved] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    FOLLOW_UP_QUESTIONS.forEach((q) => {
      const t = setTimeout(() => {
        setVisibleQuestions((prev) => [...prev, q.id]);
      }, q.delay);
      timers.push(t);
    });

    const memTimer = setTimeout(() => {
      setMemorySaved(true);
    }, 2000);
    timers.push(memTimer);

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="onboarding-wizard-step onboarding-wizard-step-discovery-ai">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full"
          style={{ background: 'rgba(20, 74, 86, 0.6)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <Brain size={20} className="text-teal-300" />
        </div>
        <div>
          <h2 className="onboarding-wizard-heading" style={{ marginBottom: 0 }}>
            Die KI denkt mit
          </h2>
          <p className="text-xs text-white/50">Stellt klärende Fragen, um dich besser zu verstehen</p>
        </div>
      </div>

      {/* Follow-up questions */}
      <div className="flex flex-col gap-3 mt-4 mb-4">
        {FOLLOW_UP_QUESTIONS.map((q) => (
          <div
            key={q.id}
            className="flex items-start gap-3 transition-all duration-500"
            style={{
              opacity: visibleQuestions.includes(q.id) ? 1 : 0,
              transform: visibleQuestions.includes(q.id) ? 'translateY(0)' : 'translateY(8px)',
            }}
          >
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5"
              style={{ background: 'rgba(26, 107, 122, 0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <MessageCircle size={13} className="text-teal-300" />
            </div>
            <p
              className="text-sm text-white/80 leading-snug py-2 px-3 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {q.question}
            </p>
          </div>
        ))}
      </div>

      {/* Memory saved notification */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-700"
        style={{
          background: memorySaved ? 'rgba(20, 74, 86, 0.4)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${memorySaved ? 'rgba(94, 234, 212, 0.3)' : 'rgba(255,255,255,0.06)'}`,
          opacity: memorySaved ? 1 : 0,
          transform: memorySaved ? 'translateY(0)' : 'translateY(6px)',
        }}
      >
        <CheckCircle2 size={16} className="text-teal-300 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-teal-300">Erinnerung gespeichert</p>
          <p className="text-xs text-white/50">ZenAI hat deine erste Idee in das Langzeitgedächtnis aufgenommen.</p>
        </div>
        <Sparkles size={14} className="text-teal-400 shrink-0 ml-auto" />
      </div>
    </div>
  );
}

export default AIDiscoveryStep;
