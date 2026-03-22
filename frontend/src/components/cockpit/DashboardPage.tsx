import { useNavigate } from 'react-router-dom';
import { CheckSquare, Brain, Calendar, Activity } from 'lucide-react';
import './DashboardPage.css';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface DashboardPageProps {
  context: AIContext;
}

interface WidgetProps {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  panel: string;
  children: React.ReactNode;
}

function Widget({ title, icon: Icon, panel, children }: WidgetProps) {
  const navigate = useNavigate();
  return (
    <button
      className="dashboard-widget"
      onClick={() => navigate(`/chat?panel=${panel}`)}
    >
      <div className="dashboard-widget__header">
        <Icon size={16} />
        <span>{title}</span>
      </div>
      <div className="dashboard-widget__content">
        {children}
      </div>
    </button>
  );
}

export function DashboardPage({ context }: DashboardPageProps) {
  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page__title">Dashboard</h1>
      <div className="dashboard-grid">
        <Widget title="Heute" icon={CheckSquare} panel="tasks">
          <p className="dashboard-widget__placeholder">Tasks und Termine laden...</p>
        </Widget>
        <Widget title="AI Insights" icon={Brain} panel="memory">
          <p className="dashboard-widget__placeholder">Vorschlaege laden...</p>
        </Widget>
        <Widget title="Letzte Aktivitaet" icon={Activity} panel="ideas">
          <p className="dashboard-widget__placeholder">Aktivitaeten laden...</p>
        </Widget>
        <Widget title="Memory Health" icon={Brain} panel="memory">
          <p className="dashboard-widget__placeholder">Cognitive Score laden...</p>
        </Widget>
      </div>
    </div>
  );
}
