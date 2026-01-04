import './Stats.css';

interface Idea {
  type: string;
  category: string;
  priority: string;
}

interface StatsProps {
  ideas: Idea[];
}

export function Stats({ ideas }: StatsProps) {
  if (ideas.length === 0) return null;

  const countBy = (key: keyof Idea) => {
    return ideas.reduce((acc, idea) => {
      const value = idea[key];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  };

  const typeStats = countBy('type');
  const categoryStats = countBy('category');
  const priorityStats = countBy('priority');

  const typeLabels: Record<string, string> = {
    idea: '💡 Ideen',
    task: '✅ Aufgaben',
    insight: '🔍 Erkenntnisse',
    problem: '⚠️ Probleme',
    question: '❓ Fragen',
  };

  const priorityLabels: Record<string, string> = {
    high: '🔴 Hoch',
    medium: '🟡 Mittel',
    low: '🟢 Niedrig',
  };

  return (
    <div className="stats">
      <div className="stats-section">
        <h4>Nach Typ</h4>
        <div className="stats-items">
          {Object.entries(typeStats).map(([type, count]) => (
            <span key={type} className="stat-item">
              {typeLabels[type] || type}: <strong>{count}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="stats-section">
        <h4>Nach Priorität</h4>
        <div className="stats-items">
          {['high', 'medium', 'low'].map(
            (priority) =>
              priorityStats[priority] && (
                <span key={priority} className="stat-item">
                  {priorityLabels[priority]}: <strong>{priorityStats[priority]}</strong>
                </span>
              )
          )}
        </div>
      </div>

      <div className="stats-section">
        <h4>Nach Kategorie</h4>
        <div className="stats-items">
          {Object.entries(categoryStats).map(([category, count]) => (
            <span key={category} className="stat-item stat-category" data-category={category}>
              {category}: <strong>{count}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
