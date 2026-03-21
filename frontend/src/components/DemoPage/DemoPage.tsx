import { useState } from 'react';
import axios from 'axios';
import './DemoPage.css';

interface DemoPageProps {
  onDemoStart: () => void;
  onNavigateToAuth: () => void;
}

const FEATURES = [
  {
    icon: '🧠',
    title: '4-Layer Memory',
    description: 'KI die sich erinnert und dazulernt',
  },
  {
    icon: '🛠️',
    title: '55 AI Tools',
    description: 'Von Recherche bis Code-Ausführung',
  },
  {
    icon: '🕸️',
    title: 'Knowledge Graph',
    description: 'Verbindungen automatisch erkennen',
  },
  {
    icon: '🤝',
    title: 'Multi-Agent Teams',
    description: 'Spezialisten arbeiten zusammen',
  },
];

export function DemoPage({ onDemoStart, onNavigateToAuth }: DemoPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDemoStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/auth/demo');
      if (res.data?.success && res.data?.data?.accessToken) {
        localStorage.setItem('zenai_token', res.data.data.accessToken);
        localStorage.setItem('zenai_demo', 'true');
        onDemoStart();
      } else {
        setError('Demo konnte nicht gestartet werden. Bitte versuche es erneut.');
      }
    } catch {
      setError('Demo konnte nicht gestartet werden. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="demo-page" role="main" aria-label="ZenAI Demo">
      <div className="demo-hero animate-spring-in">
        <div className="demo-logo" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="url(#zenai-grad)" strokeWidth="2.5" />
            <path d="M14 32L24 16L34 32H14Z" fill="url(#zenai-grad)" opacity="0.9" />
            <defs>
              <linearGradient id="zenai-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4fc3f7" />
                <stop offset="1" stopColor="#7c4dff" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className="demo-title">ZenAI</h1>
        <p className="demo-subtitle">Dein persönliches AI-Betriebssystem</p>
      </div>

      <div className="demo-features animate-stagger">
        {FEATURES.map((f) => (
          <div key={f.title} className="demo-feature-card animate-spring-slide-up">
            <span className="demo-feature-icon" aria-hidden="true">{f.icon}</span>
            <h2 className="demo-feature-title">{f.title}</h2>
            <p className="demo-feature-desc">{f.description}</p>
          </div>
        ))}
      </div>

      <div className="demo-actions animate-spring-fade">
        {error && (
          <p className="demo-error" role="alert">{error}</p>
        )}
        <button
          type="button"
          className="demo-btn-primary neuro-focus-ring"
          onClick={handleDemoStart}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Wird gestartet…' : 'Demo starten'}
        </button>
        <button
          type="button"
          className="demo-btn-secondary neuro-focus-ring"
          onClick={onNavigateToAuth}
        >
          Account erstellen
        </button>
      </div>
    </main>
  );
}

export default DemoPage;
