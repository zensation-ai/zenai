import { useState, useEffect } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './LearningTasksDashboard.css';

interface LearningTask {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high';
  target_hours: number;
  completed_hours: number;
  outline: string[] | null;
  resources: string[];
  notes: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

interface LearningStats {
  total_tasks: number;
  completed_tasks: number;
  total_hours: number;
  this_week_hours: number;
  streak_days: number;
  top_categories: [string, number][];
}

interface LearningInsight {
  id: string;
  type: string;
  message: string;
  suggestion: string;
  acknowledged: boolean;
  created_at: string;
}

interface LearningTasksDashboardProps {
  onBack: () => void;
  context: string;
}

const categoryOptions = [
  { value: 'programming', label: 'Programmierung', icon: '💻' },
  { value: 'design', label: 'Design', icon: '🎨' },
  { value: 'business', label: 'Business', icon: '💼' },
  { value: 'language', label: 'Sprache', icon: '🗣️' },
  { value: 'science', label: 'Wissenschaft', icon: '🔬' },
  { value: 'personal', label: 'Persönlich', icon: '🌱' },
  { value: 'other', label: 'Sonstiges', icon: '📚' },
];

const moodOptions = [
  { value: 'great', label: 'Super', icon: '🚀' },
  { value: 'good', label: 'Gut', icon: '😊' },
  { value: 'okay', label: 'OK', icon: '😐' },
  { value: 'difficult', label: 'Schwierig', icon: '😓' },
];

const statusLabels: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Nicht begonnen', color: '#9ca3af' },
  in_progress: { label: 'In Arbeit', color: '#3b82f6' },
  completed: { label: 'Abgeschlossen', color: '#22c55e' },
  archived: { label: 'Archiviert', color: '#6b7280' },
};

export function LearningTasksDashboard({ onBack, context }: LearningTasksDashboardProps) {
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'stats' | 'insights'>('tasks');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState<string | null>(null);
  const [generatingOutline, setGeneratingOutline] = useState<string | null>(null);

  // Form states
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    category: 'programming',
    priority: 'medium' as 'low' | 'medium' | 'high',
    target_hours: 10,
    due_date: '',
  });

  const [sessionForm, setSessionForm] = useState({
    duration_minutes: 30,
    notes: '',
    mood: 'good' as 'great' | 'good' | 'okay' | 'difficult',
    topics_covered: '',
  });

  useEffect(() => {
    loadData();
  }, [context]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksRes, statsRes, insightsRes] = await Promise.all([
        axios.get(`/api/${context}/learning-tasks`).catch(() => ({ data: { tasks: [] } })),
        axios.get(`/api/${context}/learning-stats`).catch(() => ({ data: null })),
        axios.get(`/api/${context}/learning-insights`).catch(() => ({ data: { insights: [] } })),
      ]);

      setTasks(tasksRes.data.tasks || []);
      setStats(statsRes.data);
      setInsights(insightsRes.data.insights || []);
    } catch (err) {
      console.error('Failed to load learning data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) {
      showToast('Titel erforderlich', 'error');
      return;
    }

    try {
      const res = await axios.post(`/api/${context}/learning-tasks`, {
        ...taskForm,
        due_date: taskForm.due_date || null,
      });
      setTasks(prev => [res.data.task, ...prev]);
      setShowCreateModal(false);
      setTaskForm({
        title: '',
        description: '',
        category: 'programming',
        priority: 'medium',
        target_hours: 10,
        due_date: '',
      });
      showToast('Lernziel erstellt!', 'success');
    } catch (err) {
      showToast('Erstellen fehlgeschlagen', 'error');
    }
  };

  const handleLogSession = async () => {
    if (!showSessionModal) return;

    try {
      await axios.post(`/api/${context}/learning-tasks/${showSessionModal}/session`, {
        ...sessionForm,
        topics_covered: sessionForm.topics_covered.split(',').map(t => t.trim()).filter(Boolean),
      });

      // Update task hours
      setTasks(prev => prev.map(t =>
        t.id === showSessionModal
          ? { ...t, completed_hours: t.completed_hours + sessionForm.duration_minutes / 60 }
          : t
      ));

      setShowSessionModal(null);
      setSessionForm({
        duration_minutes: 30,
        notes: '',
        mood: 'good',
        topics_covered: '',
      });
      showToast('Session geloggt!', 'success');
      loadData(); // Refresh stats
    } catch (err) {
      showToast('Loggen fehlgeschlagen', 'error');
    }
  };

  const handleGenerateOutline = async (taskId: string) => {
    try {
      setGeneratingOutline(taskId);
      const res = await axios.post(`/api/${context}/learning-tasks/${taskId}/generate-outline`);
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, outline: res.data.outline } : t
      ));
      showToast('Lernplan generiert!', 'success');
    } catch (err) {
      showToast('Generierung fehlgeschlagen', 'error');
    } finally {
      setGeneratingOutline(null);
    }
  };

  const handleUpdateStatus = async (taskId: string, status: LearningTask['status']) => {
    try {
      await axios.put(`/api/${context}/learning-tasks/${taskId}`, { status });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
      showToast('Status aktualisiert', 'success');
    } catch (err) {
      showToast('Update fehlgeschlagen', 'error');
    }
  };

  const handleAcknowledgeInsight = async (insightId: string) => {
    try {
      await axios.post(`/api/${context}/learning-insights/${insightId}/acknowledge`);
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Failed to acknowledge insight:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getProgressPercent = (task: LearningTask) => {
    if (task.target_hours === 0) return 0;
    return Math.min(100, (task.completed_hours / task.target_hours) * 100);
  };

  const getCategoryInfo = (category: string) => {
    return categoryOptions.find(c => c.value === category) || { label: category, icon: '📚' };
  };

  if (loading) {
    return (
      <div className="learning-tasks-dashboard">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Lernziele...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="learning-tasks-dashboard">
      <div className="learning-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>📚 Lernziele</h1>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
        <button className="create-btn" onClick={() => setShowCreateModal(true)}>
          + Neues Lernziel
        </button>
      </div>

      {/* Tabs */}
      <div className="learning-tabs">
        <button
          className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          📋 Lernziele
          {tasks.length > 0 && <span className="badge">{tasks.length}</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📊 Statistiken
        </button>
        <button
          className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          💡 Insights
          {insights.length > 0 && <span className="badge">{insights.length}</span>}
        </button>
      </div>

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="tab-content">
          {tasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📚</span>
              <h3>Keine Lernziele</h3>
              <p>Erstelle dein erstes Lernziel, um loszulegen.</p>
              <button className="action-btn" onClick={() => setShowCreateModal(true)}>
                + Lernziel erstellen
              </button>
            </div>
          ) : (
            <div className="tasks-list">
              {tasks.map(task => (
                <div key={task.id} className={`task-card ${task.status}`}>
                  <div className="task-header">
                    <span className="task-category">
                      {getCategoryInfo(task.category).icon} {getCategoryInfo(task.category).label}
                    </span>
                    <span
                      className="task-status"
                      style={{ color: statusLabels[task.status].color }}
                    >
                      {statusLabels[task.status].label}
                    </span>
                  </div>

                  <h3 className="task-title">{task.title}</h3>
                  {task.description && (
                    <p className="task-description">{task.description}</p>
                  )}

                  {/* Progress Bar */}
                  <div className="task-progress">
                    <div className="progress-header">
                      <span>Fortschritt</span>
                      <span>{task.completed_hours.toFixed(1)} / {task.target_hours}h</span>
                    </div>
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${getProgressPercent(task)}%` }}
                      />
                    </div>
                  </div>

                  {/* Outline */}
                  {task.outline && task.outline.length > 0 && (
                    <div className="task-outline">
                      <h4>📝 Lernplan</h4>
                      <ol>
                        {task.outline.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="task-actions">
                    <button
                      className="session-btn"
                      onClick={() => setShowSessionModal(task.id)}
                    >
                      ⏱️ Session loggen
                    </button>
                    {!task.outline && (
                      <button
                        className="outline-btn"
                        onClick={() => handleGenerateOutline(task.id)}
                        disabled={generatingOutline === task.id}
                      >
                        {generatingOutline === task.id ? '...' : '🤖 Lernplan generieren'}
                      </button>
                    )}
                    {task.status !== 'completed' && (
                      <button
                        className="complete-btn"
                        onClick={() => handleUpdateStatus(task.id, 'completed')}
                      >
                        ✓ Abschließen
                      </button>
                    )}
                  </div>

                  {task.due_date && (
                    <div className="task-due">
                      📅 Fällig: {formatDate(task.due_date)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && stats && (
        <div className="tab-content">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-icon">📚</span>
              <span className="stat-value">{stats.total_tasks}</span>
              <span className="stat-label">Lernziele</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">✅</span>
              <span className="stat-value">{stats.completed_tasks}</span>
              <span className="stat-label">Abgeschlossen</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">⏱️</span>
              <span className="stat-value">{stats.total_hours.toFixed(0)}h</span>
              <span className="stat-label">Gesamt gelernt</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">📈</span>
              <span className="stat-value">{stats.this_week_hours.toFixed(1)}h</span>
              <span className="stat-label">Diese Woche</span>
            </div>
            <div className="stat-card highlight">
              <span className="stat-icon">🔥</span>
              <span className="stat-value">{stats.streak_days}</span>
              <span className="stat-label">Tage Streak</span>
            </div>
          </div>

          {stats.top_categories.length > 0 && (
            <div className="categories-section">
              <h3>Top Kategorien</h3>
              <div className="categories-bars">
                {stats.top_categories.map(([cat, hours]) => (
                  <div key={cat} className="category-row">
                    <span className="category-icon">{getCategoryInfo(cat).icon}</span>
                    <span className="category-name">{getCategoryInfo(cat).label}</span>
                    <div className="category-bar-container">
                      <div
                        className="category-bar-fill"
                        style={{
                          width: `${(hours / Math.max(...stats.top_categories.map(([,h]) => h))) * 100}%`
                        }}
                      />
                    </div>
                    <span className="category-hours">{hours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="tab-content">
          {insights.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">💡</span>
              <h3>Keine neuen Insights</h3>
              <p>Lerne weiter, um personalisierte Tipps zu erhalten.</p>
            </div>
          ) : (
            <div className="insights-list">
              {insights.map(insight => (
                <div key={insight.id} className="insight-card">
                  <div className="insight-content">
                    <p className="insight-message">{insight.message}</p>
                    {insight.suggestion && (
                      <p className="insight-suggestion">💡 {insight.suggestion}</p>
                    )}
                  </div>
                  <button
                    className="acknowledge-btn"
                    onClick={() => handleAcknowledgeInsight(insight.id)}
                  >
                    ✓
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📚 Neues Lernziel</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Titel *</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="z.B. React Native lernen"
                />
              </div>

              <div className="form-group">
                <label>Beschreibung</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Was möchtest du lernen?"
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Kategorie</label>
                  <select
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                  >
                    {categoryOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Priorität</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as 'low' | 'medium' | 'high' })}
                  >
                    <option value="low">Niedrig</option>
                    <option value="medium">Mittel</option>
                    <option value="high">Hoch</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Ziel (Stunden)</label>
                  <input
                    type="number"
                    min="1"
                    value={taskForm.target_hours}
                    onChange={(e) => setTaskForm({ ...taskForm, target_hours: parseInt(e.target.value) || 1 })}
                  />
                </div>

                <div className="form-group">
                  <label>Fällig am (optional)</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowCreateModal(false)}>
                Abbrechen
              </button>
              <button className="save-btn" onClick={handleCreateTask}>
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Session Modal */}
      {showSessionModal && (
        <div className="modal-overlay" onClick={() => setShowSessionModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⏱️ Lernsession loggen</h2>
              <button className="close-btn" onClick={() => setShowSessionModal(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Dauer (Minuten)</label>
                <input
                  type="number"
                  min="1"
                  value={sessionForm.duration_minutes}
                  onChange={(e) => setSessionForm({ ...sessionForm, duration_minutes: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="form-group">
                <label>Wie lief es?</label>
                <div className="mood-selector">
                  {moodOptions.map(mood => (
                    <button
                      key={mood.value}
                      className={`mood-btn ${sessionForm.mood === mood.value ? 'active' : ''}`}
                      onClick={() => setSessionForm({ ...sessionForm, mood: mood.value as typeof sessionForm.mood })}
                    >
                      {mood.icon} {mood.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Themen (kommagetrennt)</label>
                <input
                  type="text"
                  value={sessionForm.topics_covered}
                  onChange={(e) => setSessionForm({ ...sessionForm, topics_covered: e.target.value })}
                  placeholder="z.B. Components, Hooks, State"
                />
              </div>

              <div className="form-group">
                <label>Notizen (optional)</label>
                <textarea
                  value={sessionForm.notes}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  placeholder="Was hast du gelernt?"
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowSessionModal(null)}>
                Abbrechen
              </button>
              <button className="save-btn" onClick={handleLogSession}>
                Session speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
