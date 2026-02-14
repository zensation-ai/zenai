import { useState, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import axios from 'axios';
import { showToast } from './Toast';
import { getErrorMessage } from '../utils/errors';
import { useConfirm } from './ConfirmDialog';
import { AIFeedback } from './AIFeedback';
import { InlineLoader } from './SkeletonLoader';
import { useNeuroFeedback } from './NeuroFeedback';
import { ContextPickerDialog } from './ContextPickerDialog';
import { getTypeIcon, getTypeLabel, IDEA_CATEGORIES, PRIORITIES } from '../constants/ideaTypes';
import type { IdeaPriority } from '../types/idea';
import { formatDate } from '../utils/dateUtils';
import { IS_NEW_THRESHOLD_MS } from '../constants';
import '../neurodesign.css';
import './IdeaCard.css';

interface Idea {
  id: string;
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: IdeaPriority;
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  is_favorite?: boolean;
  created_at: string;
  similarity?: number;
}

interface IdeaCardProps {
  idea: Idea;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onMove?: (id: string, targetContext: AIContext) => void;
  onToggleFavorite?: (id: string) => void;
  isArchived?: boolean;
  context?: AIContext;
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

function IdeaCardComponent({ idea, onDelete, onArchive, onRestore, onMove, onToggleFavorite, isArchived = false, context = 'personal', selectionMode = false, isSelected = false, onSelect }: IdeaCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const confirm = useConfirm();
  const { triggerSuccess } = useNeuroFeedback();

  // Prüfe ob Karte neu ist (weniger als 5 Minuten alt)
  const isNew = new Date().getTime() - new Date(idea.created_at).getTime() < IS_NEW_THRESHOLD_MS;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await confirm({
      title: 'Gedanke löschen',
      message: 'Möchtest du diese Idee wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await axios.delete(`/api/${context}/ideas/${idea.id}`);
      onDelete?.(idea.id);
      showToast('Gedanke gelöscht', 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Löschen fehlgeschlagen'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsArchiving(true);
    try {
      await axios.put(`/api/${context}/ideas/${idea.id}/archive`);
      onArchive?.(idea.id);
      // Neuro-optimiertes Feedback
      triggerSuccess('Archiviert!');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Archivierung fehlgeschlagen'), 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleMove = async (targetContext: AIContext) => {
    setShowContextPicker(false);
    setIsMoving(true);
    try {
      await axios.post(`/api/${context}/ideas/${idea.id}/move`, { targetContext });
      onMove?.(idea.id, targetContext);
      triggerSuccess('Verschoben!');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Verschieben fehlgeschlagen'), 'error');
    } finally {
      setIsMoving(false);
    }
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsArchiving(true);
    try {
      await axios.put(`/api/${context}/ideas/${idea.id}/restore`);
      onRestore?.(idea.id);
      showToast('Gedanke wiederhergestellt', 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Wiederherstellung fehlgeschlagen'), 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div
      className={`idea-card liquid-glass neuro-hover-lift neuro-press-effect ${isDeleting ? 'deleting' : ''} ${isNew ? 'is-new' : ''} ${isSelected ? 'selected' : ''}`}
      data-type={idea.type}
      role="article"
      aria-label={`${getTypeLabel(idea.type)}: ${idea.title}`}
    >
      {selectionMode && (
        <label className="idea-select-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect?.(idea.id, e.target.checked)}
            aria-label={`${idea.title} auswählen`}
          />
        </label>
      )}
      <div className="idea-header">
        <span className="idea-type" aria-label={getTypeLabel(idea.type)} title={getTypeLabel(idea.type)}>
          {getTypeIcon(idea.type)}
        </span>
        <h3 className="idea-title">{idea.title}</h3>
        <div className="idea-actions">
          {onToggleFavorite && !isArchived && (
            <button
              type="button"
              className={`favorite-button neuro-press-effect neuro-focus-ring ${idea.is_favorite ? 'is-favorite' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(idea.id); }}
              title={idea.is_favorite ? 'Favorit entfernen' : 'Favorit'}
              aria-label={idea.is_favorite ? 'Von Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              aria-pressed={!!idea.is_favorite}
            >
              {idea.is_favorite ? '⭐' : '☆'}
            </button>
          )}
          {isArchived ? (
            <button
              type="button"
              className="restore-button neuro-press-effect neuro-focus-ring neuro-anticipate"
              data-anticipate="Wiederherstellen"
              onClick={handleRestore}
              disabled={isArchiving}
              title="Wiederherstellen"
              aria-label="Gedanke wiederherstellen"
            >
              {isArchiving ? <InlineLoader size="small" color="muted" /> : '↩'}
            </button>
          ) : (
            <button
              type="button"
              className="archive-button neuro-press-effect neuro-focus-ring neuro-anticipate"
              data-anticipate="Archivieren"
              onClick={handleArchive}
              disabled={isArchiving}
              title="Archivieren"
              aria-label="Gedanke archivieren"
            >
              {isArchiving ? <InlineLoader size="small" color="muted" /> : '📥'}
            </button>
          )}
          {!isArchived && (
            <button
              type="button"
              className="move-button neuro-press-effect neuro-focus-ring neuro-anticipate"
              data-anticipate="Verschieben"
              onClick={(e) => { e.stopPropagation(); setShowContextPicker(true); }}
              disabled={isMoving}
              title="In anderen Kontext verschieben"
              aria-label="Gedanke verschieben"
            >
              {isMoving ? <InlineLoader size="small" color="muted" /> : '↔'}
            </button>
          )}
          <button
            type="button"
            className="delete-button neuro-press-effect neuro-focus-ring neuro-anticipate"
            data-anticipate="Löschen"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Löschen"
            aria-label="Gedanke löschen"
          >
            {isDeleting ? <InlineLoader size="small" color="muted" /> : '×'}
          </button>
        </div>
      </div>

      <p className="idea-summary">{idea.summary}</p>

      <div className="idea-meta">
        <span className={`idea-category category-${idea.category}`}>
          {IDEA_CATEGORIES[idea.category]?.label || idea.category}
        </span>
        <span className={`idea-priority priority-${idea.priority}`}>
          {PRIORITIES[idea.priority]?.label || idea.priority}
        </span>
        {idea.similarity !== undefined && (
          <span className="idea-similarity">
            {Math.round(idea.similarity * 100)}% Match
          </span>
        )}
      </div>

      {idea.next_steps && idea.next_steps.length > 0 && (
        <div className="idea-steps">
          <strong id={`steps-label-${idea.id}`}>Nächste Schritte:</strong>
          <ul aria-labelledby={`steps-label-${idea.id}`}>
            {idea.next_steps.slice(0, 3).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {idea.keywords && idea.keywords.length > 0 && (
        <div className="idea-keywords" role="list" aria-label="Keywords">
          {idea.keywords.map((kw, i) => (
            <span key={i} className="keyword" role="listitem">
              {kw}
            </span>
          ))}
        </div>
      )}

      <div className="idea-footer">
        <span className="idea-date">{formatDate(idea.created_at)}</span>
        <AIFeedback
          responseType="idea_structuring"
          originalResponse={`${idea.title}: ${idea.summary}`}
          context={context}
          compact
        />
      </div>

      <ContextPickerDialog
        isOpen={showContextPicker}
        currentContext={context}
        onSelect={handleMove}
        onCancel={() => setShowContextPicker(false)}
      />
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent updates
export const IdeaCard = memo(IdeaCardComponent);
