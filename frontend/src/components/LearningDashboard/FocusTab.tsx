import { DomainFocus, FocusStats } from './types';
import { EMPTY_STATE_MESSAGES } from '../../utils/aiPersonality';

interface FocusTabProps {
  activeAreas: DomainFocus[];
  stats: FocusStats;
  showAddFocus: boolean;
  newFocus: { name: string; description: string; keywords: string };
  onToggleFocus: (id: string, isActive: boolean) => void;
  onDeleteFocus: (id: string, name: string) => void;
  onAddFocus: () => void;
  onCreatePresets: () => void;
  onSetShowAddFocus: (show: boolean) => void;
  onSetNewFocus: (focus: { name: string; description: string; keywords: string }) => void;
}

export function FocusTab({
  activeAreas,
  stats,
  showAddFocus,
  newFocus,
  onToggleFocus,
  onDeleteFocus,
  onAddFocus,
  onCreatePresets,
  onSetShowAddFocus,
  onSetNewFocus,
}: FocusTabProps) {
  return (
    <div className="focus-tab">
      {/* Focus Stats Summary */}
      <div className="focus-stats-summary">
        <span className="focus-stat">{stats.active_focus_areas} / {stats.total_focus_areas} aktiv</span>
        <span className="focus-stat">{stats.total_ideas_linked} verknuepfte Ideen</span>
      </div>

      <div className="focus-actions">
        <button type="button" className="add-focus-button neuro-button" onClick={() => onSetShowAddFocus(true)} aria-label="Neues Fokus-Thema erstellen">
          + Neues Fokus-Thema
        </button>
        {activeAreas.length === 0 && (
          <button type="button" className="preset-button neuro-hover-lift" onClick={onCreatePresets} aria-label="Vordefinierte Fokus-Themen laden">
            Preset-Themen laden
          </button>
        )}
      </div>

      {showAddFocus && (
        <div className="add-focus-form liquid-glass neuro-stagger-item">
          <label htmlFor="focus-name" className="sr-only">Fokus-Thema Name</label>
          <input
            id="focus-name"
            type="text"
            placeholder="Name des Fokus-Themas"
            value={newFocus.name}
            onChange={(e) => onSetNewFocus({ ...newFocus, name: e.target.value })}
          />
          <label htmlFor="focus-description" className="sr-only">Beschreibung</label>
          <textarea
            id="focus-description"
            placeholder="Beschreibung (optional)"
            value={newFocus.description}
            onChange={(e) => onSetNewFocus({ ...newFocus, description: e.target.value })}
          />
          <label htmlFor="focus-keywords" className="sr-only">Keywords</label>
          <input
            id="focus-keywords"
            type="text"
            placeholder="Keywords (kommagetrennt)"
            value={newFocus.keywords}
            onChange={(e) => onSetNewFocus({ ...newFocus, keywords: e.target.value })}
          />
          <div className="form-actions">
            <button type="button" className="cancel-btn neuro-hover-lift" onClick={() => onSetShowAddFocus(false)} aria-label="Abbrechen">
              Abbrechen
            </button>
            <button type="button" className="save-btn neuro-button" onClick={onAddFocus} aria-label="Fokus-Thema erstellen">
              Erstellen
            </button>
          </div>
        </div>
      )}

      <div className="focus-list neuro-flow-list">
        {activeAreas.length === 0 ? (
          <div className="empty-state neuro-empty-state">
            <span className="neuro-empty-icon">🎯</span>
            <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.learning.title}</h3>
            <p className="neuro-empty-description">Fuge Themen hinzu, auf die sich die KI konzentrieren soll.</p>
          </div>
        ) : (
          activeAreas.slice(0, 7).map((focus, index) => (
            <div key={focus.id} className={`focus-card liquid-glass neuro-hover-lift neuro-stagger-item ${!focus.is_active ? 'inactive' : ''}`} style={{ animationDelay: `${index * 50}ms` }}>
              <div className="focus-header">
                <h3>{focus.name}</h3>
                <div className="focus-priority">Priorität: {focus.priority}</div>
              </div>
              {focus.description && <p className="focus-description">{focus.description}</p>}
              {focus.keywords.length > 0 && (
                <div className="focus-keywords">
                  {focus.keywords.map((kw, i) => (
                    <span key={i} className="keyword">{kw}</span>
                  ))}
                </div>
              )}
              {focus.learning_goals.length > 0 && (
                <div className="focus-goals">
                  <strong>Lernziele:</strong>
                  <ul>
                    {focus.learning_goals.map((goal, i) => (
                      <li key={i}>{goal}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="focus-footer">
                <span className="focus-ideas">{focus.ideas_count} verknüpfte Ideen</span>
                <div className="focus-actions">
                  <button
                    type="button"
                    className={`toggle-btn neuro-hover-lift ${focus.is_active ? 'active' : ''}`}
                    onClick={() => onToggleFocus(focus.id, focus.is_active)}
                    aria-label={focus.is_active ? 'Fokus deaktivieren' : 'Fokus aktivieren'}
                  >
                    {focus.is_active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  <button
                    type="button"
                    className="delete-btn neuro-hover-lift"
                    onClick={() => onDeleteFocus(focus.id, focus.name)}
                    aria-label={`Fokus ${focus.name} loschen`}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
